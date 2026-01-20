"""General AI chat mode (non-grounded LLM responses)."""

import os
from groq import Groq
from fastapi import HTTPException


def _get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable is not set. Set it to a valid Groq service key.")
    return Groq(api_key=api_key)


def general_chat(question: str) -> str:
    """General AI chat mode: answer using general knowledge, no grounding required."""
    try:
        client = _get_groq_client()
    except RuntimeError as e:
        # Surface a clear error to the caller
        raise HTTPException(status_code=500, detail=str(e))

    prompt = f"""You are a helpful and knowledgeable AI assistant. Answer the user's question clearly, concisely, and accurately using your general knowledge.

Question: {question}

Answer:"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )

    return response.choices[0].message.content
