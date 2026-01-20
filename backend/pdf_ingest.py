"""
PDF ingestion helpers.
Extracts text per page and provides a site_id when missing.
"""

import io
import re
import pdfplumber
from typing import Dict, Any, List
from urllib.parse import urlparse


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "pdf"


def derive_site_id(source_url: str) -> str:
    try:
        parsed = urlparse(source_url)
        base = parsed.netloc or parsed.path.split("/")[-1]
    except Exception:
        base = source_url or "pdf"
    return f"pdf-{slugify(base)}"


def extract_pdf_pages(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Extract text per page; returns list of {page_number, text}."""
    pages: List[Dict[str, Any]] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            cleaned = text.strip()
            if cleaned:
                pages.append({"page_number": idx + 1, "text": cleaned})
    return pages


def ingest_pdf_document(file_bytes: bytes, source_url: str, site_id: str | None = None) -> Dict[str, Any]:
    pages = extract_pdf_pages(file_bytes)
    if not pages:
        raise ValueError("No extractable text found in PDF")

    final_site_id = site_id or derive_site_id(source_url)

    return {
        "pages": pages,
        "pages_count": len(pages),
        "site_id": final_site_id,
        "source_url": source_url,
    }
