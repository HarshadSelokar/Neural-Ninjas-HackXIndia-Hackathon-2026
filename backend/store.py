from supabase_client import supabase

def store_chunks(chunks, embeddings, source_url, site_id, source_type="website", timestamp=None, page_number=None):
    """
    Store multiple chunks in a single DB insert.

    - `timestamp` may be a single value (applied to all rows) or a list of per-row timestamps.
    - `page_number` may be a single value or a list of per-row page numbers.
    """
    rows = []
    use_per_row_timestamp = isinstance(timestamp, (list, tuple))
    use_per_row_page = isinstance(page_number, (list, tuple))

    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        row = {
            "content": chunk,
            "embedding": emb.tolist(),
            "source_url": source_url,
            "site_id": site_id,
            "source_type": source_type,
        }

        if timestamp is not None:
            row["timestamp"] = timestamp[i] if use_per_row_timestamp else timestamp

        if page_number is not None:
            row["page_number"] = page_number[i] if use_per_row_page else page_number

        rows.append(row)

    # Single batch insert to reduce network round-trips
    supabase.table("documents").insert(rows).execute()
