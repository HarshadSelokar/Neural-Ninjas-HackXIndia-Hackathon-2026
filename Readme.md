# SiteSage — AI-Powered RAG Assistant


**What this project is**
- An end-to-end Retrieval-Augmented Generation (RAG) system that indexes websites, YouTube video transcripts, and PDFs; stores vector embeddings in Supabase; and provides a chat interface (web + browser extension) for grounded, source-backed answers.

**Primary components**
- `backend/` — FastAPI service that exposes ingestion, chat, snapshot captioning and PDF export endpoints.
- `web_frontend/` — Next.js app that proxies user actions to the backend and offers a UI to ingest and chat.
- `ext_frontend/` — Chrome extension (Manifest V3) that injects a sidebar, captures website context, and includes a Smart Snapshot feature for video learning.

Key backend modules
- `main.py` — API endpoints: `/ingest`, `/chat`, `/ingest/youtube`, `/ingest/pdf`, `/recrawl`, and snapshot routes.
- `crawler.py` — Playwright-based site crawler and HTML cleaner.
- `chunker.py` — Token-based text chunking using `tiktoken`.
- `embeddings.py` — `sentence-transformers` embedding model (`all-MiniLM-L6-v2`).
- `retriever.py` — Calls Supabase RPC `match_documents` to perform vector search.
- `llm.py` / `llm_general.py` — Groq LLM wrapper for grounded and general responses.
- `store.py` / `supabase_client.py` — Persists documents and embeddings to Supabase.
- `youtube_ingest.py`, `pdf_ingest.py` — Helpers for video transcript and PDF extraction.
- `snapshots.py` — Snapshot caption generation and PDF export utilities.

Extension details
- `ext_frontend/smart_snapshot.js` — Injects a camera button into HTML5/YouTube players, captures a frame, and sends it to the background service worker for captioning and storage.
- `ext_frontend/background.js` — Handles network proxying, snapshot persistence (chrome.storage.local), and export orchestration.
- Snapshot storage: `chrome.storage.local` keys named `snapshots_{videoId}` hold arrays of snapshot objects.

Snapshot JSON shape
```
{
	"id": "...",
	"videoUrl": "https://...",
	"title": "...",
	"timestamp": "HH:MM:SS",
	"timestampSeconds": 123.45,
	"imageDataUrl": "data:image/jpeg;base64,...",
	"caption": "...",
	"transcriptContext": "...",
	"createdAt": "ISO timestamp"
}
```

Quick start (backend)
1. Create and activate a Python virtual environment in `backend/`.
2. Install requirements:
```powershell
python -m pip install -r backend/requirements.txt
```
3. Set environment variables (at minimum):
```powershell
#$env:GROQ_API_KEY = "gsk_..."  # Groq service key
#$env:SUPABASE_URL = "https://<your>.supabase.co"
#$env:SUPABASE_KEY = "<service_role_or_key>"
```
4. Run the backend:
```powershell
cd backend
uvicorn main:app --reload --port 8000
```

Quick start (extension)
1. In Chrome, open `chrome://extensions` and enable Developer mode.
2. Load unpacked extension and select the `ext_frontend/` folder.
3. Visit YouTube or any page with an HTML5 `<video>`; use the camera button (or Alt+S) to take Smart Snapshots.

Usage notes
- Smart Snapshot captures the current video frame (canvas), extracts timestamp, and sends the image to the background worker. The backend may generate a short caption using transcript +/-15s and the project's LLM.
- The popup lists saved snapshots for the current video and allows editing captions before export.
- Clicking "Finish & Export PDF" sends snapshots to the backend `/snapshots/export_pdf` route which builds a PDF and returns it for download.

Security & secrets
- Do NOT commit API keys. `llm_general.py` and `llm.py` expect `GROQ_API_KEY` from the environment.
- `supabase_client.py` currently contains a fallback key; rotate and replace it with environment-only config.

Troubleshooting
- If PDF export returns 404: ensure `backend/snapshots.py` imports succeeded and that `reportlab` + `Pillow` are installed.
- If images are blank in PDF: the backend converts images via ReportLab's `ImageReader` to avoid canvas/dataURL issues.

Development tips
- Restart the backend after changing env vars.
- For local development the extension can use `http://127.0.0.1:8000` as `BACKEND_URL` in the popup; adjust `ext_frontend/popup.js` constant if needed.

Roadmap / next steps
- Add Supabase sync for snapshots (cloud backup) and auth for backend endpoints.
- Add OCR fallback (Tesseract.js) for slide-heavy video captures.
- Add per-snapshot tagging, search, and Notion export.

---

Developed By Team NEURAL NINJAS
