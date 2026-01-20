import tiktoken

tokenizer = tiktoken.get_encoding("cl100k_base")

def chunk_text(text, max_tokens=800, overlap=20):
    tokens = tokenizer.encode(text)
    chunks = []

    start = 0
    while start < len(tokens):
        end = start + max_tokens
        chunk_tokens = tokens[start:end]
        chunk_text = tokenizer.decode(chunk_tokens)
        chunks.append(chunk_text)
        start += max_tokens - overlap

    return chunks
