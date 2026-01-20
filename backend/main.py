import sys
import asyncio
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, BackgroundTasks
# On Windows, ensure the Proactor event loop is used so subprocesses work
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        # If setting the policy fails for any reason, continue with default
        pass
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

# Lazy-import heavy modules inside endpoints to keep startup light

app = FastAPI(title="Website-to-RAG Chatbot")

# Extra endpoints for snapshots (smart snapshot captioning and PDF export)
try:
    from snapshots import router as snapshots_router
    app.include_router(snapshots_router)
except Exception as e:
    # If snapshots module import fails (missing deps etc), log the error so it's visible
    print(f"[main] Failed to include snapshots router: {e}")

# --- CORS for extension/frontend (dev-friendly) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Allow Private Network Access preflight for localhost in Chrome
@app.middleware("http")
async def add_private_network_header(request, call_next):
    response = await call_next(request)
    if request.method == "OPTIONS":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# --- Pydantic Models ---
class IngestRequest(BaseModel):
    url: str

class YouTubeIngestRequest(BaseModel):
    video_url: str
    site_id: str | None = None

class ChatRequest(BaseModel):
    question: str
    site_id: str | None = None
    mode: str = "rag"  # "rag" or "general"
    source_types: list[str] | None = None  # ["website", "youtube", "pdf"]

# --- Endpoints ---
@app.post("/ingest")
def ingest_site(req: IngestRequest):
    from crawler import crawl_site, clean, get_site_id
    from chunker import chunk_text
    from embeddings import embed_chunks
    from store import store_chunks
    from site_checker import site_exists

    site_id = get_site_id(req.url)

    # Check if site has already been ingested
    existing = site_exists(site_id)
    if existing:
        return {
            "status": "success",
            "chunks_indexed": existing["chunks_indexed"],
            "pages_crawled": existing["chunks_indexed"],  # Approximate; not tracked separately
            "site_id": site_id,
            "url": req.url,
            "cached": True,  # Indicate data was already in DB
        }

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
        "cached": False,
    }

@app.post("/chat")
def chat(req: ChatRequest):
    # Support two modes:
    # - "rag": requires a site_id and runs retrieval-augmented generation
    # - "general": no site_id required; route to general-chat LLM
    if req.mode == "general":
        try:
            from llm_general import general_chat
            answer = general_chat(req.question)
            return {"answer": answer, "sources": [], "mode": "general"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"General chat failed: {e}")

    # For RAG mode, require site_id
    if not req.site_id:
        raise HTTPException(status_code=400, detail="site_id is required for rag mode")

    from rag import rag_chat
    result = rag_chat(req.question, site_id=req.site_id, source_types=req.source_types, mode=req.mode)
    result["mode"] = req.mode
    return result

@app.post("/ingest/youtube")
def ingest_youtube(req: YouTubeIngestRequest, background_tasks: BackgroundTasks):
    from youtube_ingest import ingest_youtube_video, process_transcript, transcribe_audio_fallback
    from chunker import chunk_text
    from embeddings import embed_chunks
    from store import store_chunks
    from job_manager import create_job, update_job

    try:
        # Try ingest using official captions first
        try:
            result = ingest_youtube_video(req.video_url, req.site_id)
        except ValueError as e:
            # If there is no transcript, run audio->text fallback in background
            msg = str(e)
            if 'No transcript found' in msg or 'Transcripts are disabled' in msg:
                job_id = create_job('transcription', {'video_url': req.video_url, 'site_id': req.site_id})

                def _run_transcription(video_url, site_id, job_id):
                    try:
                        update_job(job_id, status='running', progress=5)
                        segments = transcribe_audio_fallback(video_url, video_id=None, job_id=job_id)
                        update_job(job_id, progress=50)

                        # process and store chunks using same pipeline used for captions
                        chunks = process_transcript(segments, video_url, site_id or f"youtube-{job_id}")
                        texts = [c['text'] for c in chunks]
                        combined_text = " ".join(texts)
                        chunked = chunk_text(combined_text)
                        embeddings = embed_chunks(chunked)
                        final_site_id = site_id or f"youtube-{job_id}"

                        timestamps = []
                        for i in range(len(chunked)):
                            segment_index = min(i * len(chunks) // len(chunked), len(chunks) - 1)
                            timestamps.append(chunks[segment_index]['metadata']['timestamp'])

                        store_chunks(chunked, embeddings, video_url, final_site_id, source_type='youtube', timestamp=timestamps)

                        update_job(job_id, status='completed', progress=100, result={'site_id': final_site_id})
                    except Exception as ex:
                        update_job(job_id, status='failed', progress=100, error=str(ex))

                background_tasks.add_task(_run_transcription, req.video_url, req.site_id, job_id)
                return {"status": "accepted", "job_id": job_id, "message": "No captions found; audio transcription started as background job."}
            # otherwise re-raise to be handled below
            raise

        # If we have captions, continue synchronously as before
        final_site_id = req.site_id or f"youtube-{result['video_id']}"
        texts = [chunk['text'] for chunk in result['chunks']]
        combined_text = " ".join(texts)
        chunks = chunk_text(combined_text)
        embeddings = embed_chunks(chunks)

        # Prepare per-chunk timestamps to allow a single batch insert
        timestamps = []
        for i in range(len(chunks)):
            segment_index = min(i * len(result['chunks']) // len(chunks), len(result['chunks']) - 1)
            timestamps.append(result['chunks'][segment_index]['metadata']['timestamp'])

        store_chunks(
            chunks,
            embeddings,
            req.video_url,
            final_site_id,
            source_type="youtube",
            timestamp=timestamps,
        )

        return {
            "status": "success",
            "chunks_indexed": len(chunks),
            "segments_processed": result['segments_count'],
            "site_id": final_site_id,
            "video_id": result['video_id'],
            "source_url": result['source_url']
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest YouTube video: {str(e)}")


@app.get('/transcription/job/{job_id}')
def get_transcription_job(job_id: str):
    from job_manager import get_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return job


@app.post("/ingest/pdf")
async def ingest_pdf(
    request: Request,
    file: UploadFile | None = File(None),
    url: str | None = Form(None),
    site_id: str | None = Form(None),
):
    from pdf_ingest import ingest_pdf_document
    from chunker import chunk_text
    from embeddings import embed_chunks
    from store import store_chunks

    # Support both multipart/form-data (file or url) and application/json (url)
    if file is None and not url:
        try:
            body = await request.json()
            url = body.get("url")
            site_id = body.get("site_id") or site_id
        except Exception:
            pass

    if file is None and (not url or not url.strip()):
        raise HTTPException(status_code=400, detail="Provide either a PDF file or a PDF URL")

    # Get PDF bytes and source URL label
    if file is not None:
        file_bytes = await file.read()
        source_url = file.filename or "uploaded.pdf"
    else:
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            file_bytes = resp.content
            source_url = url
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch PDF: {str(e)}")

    try:
        doc = ingest_pdf_document(file_bytes, source_url, site_id)
        final_site_id = doc["site_id"]

        # Chunk per page to preserve page_number metadata
        chunk_texts = []
        page_numbers = []
        for page in doc["pages"]:
            pieces = chunk_text(page["text"])
            for p in pieces:
                chunk_texts.append(p)
                page_numbers.append(page["page_number"])

        if not chunk_texts:
            raise ValueError("No text extracted from PDF")

        embeddings = embed_chunks(chunk_texts)

        for chunk, emb, page_num in zip(chunk_texts, embeddings, page_numbers):
            store_chunks(
                [chunk],
                [emb],
                source_url,
                final_site_id,
                source_type="pdf",
                page_number=page_num,
            )

        return {
            "status": "success",
            "chunks_indexed": len(chunk_texts),
            "pages_processed": doc["pages_count"],
            "site_id": final_site_id,
            "source_url": source_url,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest PDF: {str(e)}")

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
