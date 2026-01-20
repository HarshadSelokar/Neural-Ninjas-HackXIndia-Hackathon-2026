from supabase_client import supabase
import numpy as np

def retrieve_similar(query_embedding, site_id, top_k=5, source_types=None):
    # Convert numpy array to list for JSON serialization
    if isinstance(query_embedding, np.ndarray):
        query_embedding = query_embedding.tolist()

    # If source_types filter is provided, fetch more results to account for filtering
    fetch_count = top_k * 3 if source_types else top_k

    response = supabase.rpc(
        "match_documents",
        {
            "query_embedding": query_embedding,
            "match_count": fetch_count,
            "filter_site_id": site_id,
        }
    ).execute()

    docs = response.data
    
    # Apply source_types filter if provided
    if source_types:
        docs = [d for d in docs if d.get("source_type", "website") in source_types]
        docs = docs[:top_k]  # Limit to top_k after filtering
    
    return docs
