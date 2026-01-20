import io
import base64
from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from llm import generate_answer, generate_caption
from youtube_ingest import extract_video_id, fetch_transcript

# Defer heavy PDF/image imports to runtime to avoid import-time failures

router = APIRouter()


class CaptionRequest(BaseModel):
    video_url: str
    timestamp_seconds: float
    ocr_text: str | None = None


class ExportRequest(BaseModel):
    snapshots: List[dict]
    videoUrl: str | None = None


@router.post("/snapshot/caption")
def snapshot_caption(req: CaptionRequest):
    """Generate a short 1-2 line caption for a video timestamp.
    Attempts to fetch transcript (+/-15s) then prompts the LLM for a concise caption.
    """
    video_url = req.video_url
    ts = req.timestamp_seconds
    ocr = req.ocr_text or ""

    try:
        video_id = extract_video_id(video_url)
    except Exception:
        video_id = None

    transcript_snippet = ""
    if video_id:
        try:
            transcript = fetch_transcript(video_id)
            # collect segments within +/-15s
            window = 15
            parts = [seg['text'] for seg in transcript if abs(seg['start'] - ts) <= window]
            transcript_snippet = "\n".join(parts)
        except Exception:
            transcript_snippet = ""

    # Use the dedicated caption generator which asks for a more elaborative, readable caption
    try:
        caption = generate_caption(transcript_snippet, ocr_text=ocr, video_id=video_id, elaborative=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Caption generation failed: {e}")

    return {"caption": caption}


@router.post("/snapshots/export_pdf")
def export_pdf(req: ExportRequest):
    """Accepts snapshots array and returns application/pdf bytes.
    Each snapshot should include imageDataUrl, caption, timestamp, title metadata.
    """
    snapshots = req.snapshots
    if not snapshots:
        raise HTTPException(status_code=400, detail="No snapshots provided")

    # Lazy-import heavy libraries
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Image, Spacer, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib import utils
        from PIL import Image as PILImage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export dependencies missing: {e}")

    # Document setup
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    page_width, page_height = letter
    max_image_width = page_width - doc.leftMargin - doc.rightMargin
    max_image_height = 3.5 * inch

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'title', parent=styles['Heading3'], fontName='Helvetica-Bold', fontSize=12, leading=14, spaceAfter=6
    )
    meta_style = ParagraphStyle('meta', parent=styles['Normal'], fontSize=9, leading=11, textColor='#444444')
    caption_style = ParagraphStyle('caption', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=10, leading=13)

    elements = []

    for snap in snapshots:
        caption = snap.get('caption', '') or ''
        timestamp = snap.get('timestamp', '') or ''
        title = snap.get('title', '') or snap.get('videoUrl', '') or ''

        # Title and timestamp
        title_text = f"{title}"
        elements.append(Paragraph(title_text[:200], title_style))
        if timestamp:
            elements.append(Paragraph(f"Timestamp: {timestamp}", meta_style))
        elements.append(Spacer(1, 6))

        # Image
        imgdata = snap.get('imageDataUrl') or snap.get('image_data_url')
        if imgdata and isinstance(imgdata, str) and imgdata.startswith('data:'):
            try:
                header, b64 = imgdata.split(',', 1)
                imgbytes = base64.b64decode(b64)
                pil_img = PILImage.open(io.BytesIO(imgbytes)).convert('RGB')
                iw, ih = pil_img.size

                # Compute scaled dimensions preserving aspect ratio
                scale = min(max_image_width / iw, max_image_height / ih, 1)
                draw_w = iw * scale
                draw_h = ih * scale

                img_io = io.BytesIO()
                pil_img.save(img_io, format='JPEG')
                img_io.seek(0)

                rl_img = Image(img_io, width=draw_w, height=draw_h)
                elements.append(rl_img)
            except Exception as e:
                print(f"[snapshots.export_pdf] image processing failed: {e}")
        else:
            # placeholder when no image
            elements.append(Paragraph('<i>No snapshot image</i>', meta_style))

        elements.append(Spacer(1, 12))

        # Caption (wrapped, will not overflow page width)
        elements.append(Paragraph(caption, caption_style))

        # Footer small note or spacing
        elements.append(Spacer(1, 18))
        elements.append(PageBreak())

    # Build PDF
    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type='application/pdf')
