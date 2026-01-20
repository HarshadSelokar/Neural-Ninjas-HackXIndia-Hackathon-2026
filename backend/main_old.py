import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

# Lazy-import heavy modules inside endpoints to keep startup light

app = FastAPI(title="Website-to-RAG Chatbot")

# --- Pydantic Models ---
class IngestRequest(BaseModel):
    url: str

class ChatRequest(BaseModel):
    question: str
    site_id: str

# --- Endpoints ---
@app.post("/ingest")
def ingest_site(req: IngestRequest):
    from crawler import crawl_site, clean, get_site_id
    from chunker import chunk_text
    from embeddings import embed_chunks
    from store import store_chunks

    site_id = get_site_id(req.url)

    # Use deeper crawl to capture contact, history, about pages
    pages = crawl_site(req.url, max_depth=3, max_pages=40)

    total_chunks = 0
    for page_url, html in pages:
        text = clean(html)
        # Skip only extremely sparse pages; keep concise but meaningful content
        if len(text.strip()) < 100:
            continue
        chunks = chunk_text(text)
        if not chunks:
            continue
        embeddings = embed_chunks(chunks)
        # Store with the specific page URL and site_id
        store_chunks(chunks, embeddings, page_url, site_id)
        total_chunks += len(chunks)

    return {
        "status": "success",
        "chunks_indexed": total_chunks,
        "pages_crawled": len(pages),
        "site_id": site_id,
        "url": req.url,
    }

@app.post("/chat")
def chat(req: ChatRequest):
    from rag import rag_chat
    result = rag_chat(req.question, site_id=req.site_id)
    return result

@app.post("/recrawl")
def recrawl(req: IngestRequest):
    # For hackathon: same as ingest (overwrite logic handles duplicates typically)
    return ingest_site(req)

# --- Startup Logic ---
if __name__ == "__main__":
    # This block only runs if you execute: python main.py
    uvicorn.run(
        "main:app", 
        host="127.0.0.1", 
        port=8000, 
        reload=True  # Automatically restarts when you make code changes
    )