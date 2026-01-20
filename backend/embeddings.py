from sentence_transformers import SentenceTransformer
import numpy as np

try:
    import torch
    _has_mps = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
except Exception:
    _has_mps = False

_device = "mps" if _has_mps else "cpu"
model = SentenceTransformer("all-MiniLM-L6-v2", device=_device)

def embed_chunks(chunks):
    # Optimize by disabling progress bar for small batches and using larger batches
    embeddings = model.encode(
        chunks,
        show_progress_bar=len(chunks) > 20,
        batch_size=64,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return embeddings
