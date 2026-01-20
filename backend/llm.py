import os
from groq import Groq

# Load Groq API key from environment for security and flexibility.
# Do NOT keep API keys committed in source control.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY environment variable is not set. Set GROQ_API_KEY to a valid API key."
    )

client = Groq(api_key=GROQ_API_KEY)

def generate_answer(context, question, site_id: str, mode: str = "rag"):
    """
    Generate an answer based on context and mode.
    
    mode = "rag": Strict Grounded Mode - ONLY use context, refuse if not available
    mode = "general": Assisted Reasoning Mode - use context as primary reference, allow general knowledge
    """
    
    if mode == "rag":
        return _strict_rag_answer(context, question, site_id)
    else:
        return _assisted_reasoning_answer(context, question, site_id)

def _strict_rag_answer(context, question, site_id: str):
    prompt = f"""You are a website-specific assistant for {site_id}. Your job is to answer questions using ONLY the provided website content.

## STRICT RULES (NON-NEGOTIABLE)

1. **ONLY USE PROVIDED CONTEXT**: Every claim, fact, or piece of information MUST come directly from the context below. Do NOT use external knowledge, general knowledge, or anything not explicitly stated in the context.

2. **NO HALLUCINATION**: If the answer is not in the context, you MUST say: "The information is not available on this website." Do NOT invent, assume, or guess. Do NOT say "likely," "probably," or "might be."

3. **NO EXTERNAL DOMAINS/URLS**: 
   - Do NOT mention, link to, or reference any domain other than {site_id}.
   - Do NOT include URLs, links, or "Visit https://..." in your answer text.
   - Do NOT fabricate website sections or pages.
   - Sources will be provided separately by the application; do not cite them in your text.

4. **STAY ON TOPIC**: Keep answers focused on the question asked. Do not add extra information unless directly relevant.

5. **NO META-COMMENTARY**: Do not explain what you're doing. Do not say "Based on the context..." or "The website says..." Just provide the answer directly.

## HANDLING DIFFERENT QUESTION TYPES

### Type A: Factual Questions ("When was X established?" "What is the phone number?")
- If the fact is in the context: State it directly and clearly.
- If the fact is NOT in the context: Say "The information is not available on this website."
- Do NOT infer or extrapolate. Do NOT say "It's probably..." or "It might be..."

### Type B: Definition/Explanation Questions ("What is PMJDY?" "What does this acronym mean?")
- If a definition or explanation exists in context: Provide it clearly and concisely.
- If NOT in context: Say "The information is not available on this website."
- Do NOT provide general knowledge definitions from outside the website.

### Type C: General Website Questions ("What is this website about?" "What can I do here?")
- Summarize the website's purpose, scope, and main offerings using ONLY the provided context.
- Be concise but informative.
- If the context is sparse, acknowledge that and provide what you can.
- Do NOT invent features or services not mentioned in the context.

### Type D: How-To / Process Questions ("How do I register?" "What are the steps to apply?")
- If step-by-step instructions exist in context: Provide them clearly, in order.
- If NOT in context: Say "The information is not available on this website."
- Do NOT assume or fill in missing steps.

### Type E: Ambiguous or Unclear Questions
- Ask for clarification OR provide the most likely interpretation based on context.
- If you cannot answer with confidence from context alone: Say "The information is not available on this website."

## OUTPUT FORMAT

- **Answer**: Provide your response directly. Keep it factual, clear, and concise (1-3 sentences for simple answers, longer for complex ones).
- **When "Not Available"**: Use EXACTLY: "The information is not available on this website."
- **Do NOT include**:
  - URLs or links
  - Domain names (except {site_id} if unavoidable)
  - Meta-commentary or disclaimers
  - "Based on the context..." preambles

## EDGE CASES

- **Contradictory context**: If the context contradicts itself, state the most recent or authoritative version if clear; otherwise say the information is conflicting on the website.
- **Partial information**: If the context has partial info, provide what's available and note that additional details are not available if relevant.
- **Confidence**: Only answer if you're confident the information directly supports your answer. When in doubt, say the information is not available.

---

## CONTEXT (from {site_id})

{context}

---

## QUESTION

{question}

## YOUR ANSWER
"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2
    )

    return response.choices[0].message.content
def _assisted_reasoning_answer(context, question, site_id: str):
    """
    Assisted Reasoning Mode:
    - Uses retrieved context as primary reference
    - May use general knowledge to explain or infer
    - Indicates when reasoning goes beyond sources
    - No refusal logic; always provides an answer
    """
    prompt = f"""You are an AI assistant helping users understand information about {site_id}.

You have access to content from {site_id} as reference material. Use this context as your primary source when available.

You may use general knowledge to reason, explain, or provide context beyond what is explicitly stated in the reference material.

Rules:
- Prefer information from the provided context when available and relevant.
- If you add information or reasoning that goes beyond the context, explicitly indicate it (e.g., "Based on general knowledge..." or "In addition to the context...").
- Do NOT refuse to answer. Always provide a helpful response.
- Keep answers clear and concise.

Reference Context from {site_id}:

{context}

---

Question: {question}

Answer:"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.5  # Slightly higher temperature for more creative reasoning
    )

    return response.choices[0].message.content


def generate_caption(transcript_snippet: str, ocr_text: str | None = None, video_id: str | None = None, elaborative: bool = True):
    """
    Generate a readable, slightly elaborative caption for a video timestamp.

    - `transcript_snippet`: short transcript around the timestamp (may be empty)
    - `ocr_text`: optional OCR/extracted on-screen text
    - `video_id`: optional id for context labeling
    - `elaborative`: if True produce 2-5 sentences; if False produce shorter caption

    This function intentionally does not enforce a strict line-length limit.
    """
    parts = []
    if transcript_snippet:
        parts.append(f"Transcript excerpt:\n{transcript_snippet}")
    if ocr_text:
        parts.append(f"OCR from screen:\n{ocr_text}")

    context = "\n\n".join(parts) if parts else ""

    if elaborative:
        user_instruction = (
            "Write a clear, easy-to-understand, slightly elaborative caption for an academic video. "
            "Aim for 2-5 short sentences that summarize the key idea shown at this timestamp. "
            "Use plain language, avoid jargon, and expand where helpful for clarity. Do NOT truncate or artificially limit the caption length."
        )
    else:
        user_instruction = "Write a concise 1-2 line caption summarizing the key moment."

    prompt = f"{user_instruction}\n\nReference:\n{context}\n\nCaption:" if context else f"{user_instruction}\n\nCaption:"

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.6,
        max_tokens=256,
    )

    return response.choices[0].message.content