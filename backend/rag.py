from embeddings import model
from retriever import retrieve_similar
from llm import generate_answer
import re

def rag_chat(question, site_id, source_types=None, mode="rag"):
    """
    Chat with retrieved context.
    
    Always retrieves context from embeddings, but behavior differs by mode:
    - mode="rag": Strict Grounded Mode (strict refusal if not in context)
    - mode="general": Assisted Reasoning Mode (can reason beyond context)
    """
    query_embedding = model.encode(
        question,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    docs = retrieve_similar(query_embedding, site_id=site_id, top_k=25, source_types=source_types)
    print(f"[RAG] Retrieved {len(docs)} total docs for question: {question} | mode={mode}")

    if not docs:
        if mode == "rag":
            return "The information is not available on this website."
        else:
            # Assisted Reasoning Mode: allow answering even with no context
            context = ""
            answer = generate_answer(context, question, site_id, mode=mode)
            return {"answer": answer, "sources": []}

    # Exclude auth/utility pages but rely on semantic similarity for relevance
    filtered_docs = []
    banned_url_terms = ("login", "signin", "logout", "register", "signup", "account", "admin", "securepages")
    for d in docs:
        url = (d.get("source_url") or "").lower()
        if any(term in url for term in banned_url_terms):
            continue
        content = d.get("content", "")
        # Keep pages with meaningful content (>50 chars), trust semantic ranking
        if len(content.strip()) > 50:
            filtered_docs.append(d)

    # Trust semantic similarity ranking; don't re-rank by keywords
    # The vector search already ranked by cosine similarity
    docs = filtered_docs[:5]
    
    print(f"[RAG] After filtering: {len(docs)} docs kept")
    for i, d in enumerate(docs):
        print(f"  [{i+1}] {d.get('source_url', 'unknown')} | len={len(d.get('content', ''))} chars")

    if not docs:
        if mode == "rag":
            return "The information is not available on this website."
        else:
            # Assisted Reasoning: allow answering even with no context
            context = ""
            answer = generate_answer(context, question, site_id, mode=mode)
            return {"answer": answer, "sources": []}

    context = ""
    sources = []

    for d in docs:
        context += d["content"] + "\n\n"
        
        source_obj = {
            "url": d["source_url"],
            "type": d.get("source_type", "website")
        }
        
        # Add timestamp for YouTube sources
        if d.get("source_type") == "youtube" and d.get("timestamp"):
            source_obj["timestamp"] = d["timestamp"]

        # Add page number for PDF sources
        if d.get("source_type") == "pdf" and d.get("page_number"):
            source_obj["page_number"] = d["page_number"]
        
        # Avoid duplicate sources
        if source_obj not in sources:
            sources.append(source_obj)

    # Keep context to a reasonable size for the model
    if len(context) > 4000:
        context = context[:4000]

    answer = generate_answer(context, question, site_id, mode=mode)
    # Post-process to strip any accidental URLs or "URL:" lines in the answer text
    answer = re.sub(r"https?://\S+", "", answer or "").strip()
    answer = re.sub(r"^\s*URL\s*:.*$", "", answer, flags=re.IGNORECASE | re.MULTILINE).strip()
    
    # Only check for "not available" refusal in strict RAG mode
    if mode == "rag":
        ans_lower = (answer or "").lower()
        if "the information is not available on this website" in ans_lower:
            # If model declares not-available, do not attach sources.
            return {"answer": answer, "sources": []}

    return {
        "answer": answer,
        "sources": sources
    }
