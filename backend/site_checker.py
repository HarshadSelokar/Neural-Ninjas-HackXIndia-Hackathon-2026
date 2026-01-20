"""Check if a site has already been ingested."""

from supabase_client import supabase


def site_exists(site_id: str) -> dict | None:
    """
    Check if a site_id already exists in the documents table.
    Returns a dict with site stats if found, None otherwise.
    """
    try:
        response = supabase.table("documents").select(
            "id, site_id"
        ).eq("site_id", site_id).limit(1).execute()
        
        if response.data and len(response.data) > 0:
            # Site exists; count total chunks for this site
            count_response = supabase.table("documents").select(
                "id", count="exact"
            ).eq("site_id", site_id).execute()
            
            chunk_count = count_response.count or 0
            
            return {
                "exists": True,
                "site_id": site_id,
                "chunks_indexed": chunk_count,
            }
        else:
            return None
    except Exception as e:
        print(f"[site_checker] Error checking site {site_id}: {e}")
        return None
