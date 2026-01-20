"""
YouTube Video Transcript Ingestion Module

Fetches transcripts from YouTube videos and processes them for RAG.
Uses youtube-transcript-api to retrieve captions/subtitles.
"""

import re
from typing import Dict, Any, List
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import tempfile
import os
import json
import subprocess
import shutil
from job_manager import create_job, update_job


def extract_video_id(url: str) -> str:
    """
    Extract YouTube video ID from various URL formats.
    
    Supports:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://www.youtube.com/embed/VIDEO_ID
    
    Args:
        url: YouTube video URL
    
    Returns:
        Video ID string
    
    Raises:
        ValueError: If URL format is invalid
    """
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'youtube\.com\/watch\?.*v=([^&\n?#]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    raise ValueError(f"Could not extract video ID from URL: {url}")


def format_timestamp(seconds: float) -> str:
    """
    Convert seconds to mm:ss format.
    
    Args:
        seconds: Time in seconds
    
    Returns:
        Formatted timestamp string (e.g., "05:32")
    """
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def fetch_transcript(video_id: str) -> List[Dict[str, Any]]:
    """
    Fetch transcript for a YouTube video.
    
    Args:
        video_id: YouTube video ID
    
    Returns:
        List of transcript segments with 'text', 'start', 'duration'
    
    Raises:
        TranscriptsDisabled: If transcripts are disabled for the video
        NoTranscriptFound: If no transcript is available
    """
    try:
        # Prefer the public API method `get_transcript` when available
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
        except AttributeError:
            # Fallback for older/newer versions that expose instance fetch()
            api = YouTubeTranscriptApi()
            transcript = api.fetch(video_id)

        # Normalize into list of dicts with expected keys
        normalized = []
        for seg in transcript:
            # The library may return dicts or objects depending on version
            if isinstance(seg, dict):
                text = seg.get('text', '')
                start = seg.get('start', 0)
                duration = seg.get('duration', 0)
            else:
                # object-like segment (older versions)
                text = getattr(seg, 'text', '')
                start = getattr(seg, 'start', 0)
                duration = getattr(seg, 'duration', 0)
            normalized.append({'text': text, 'start': start, 'duration': duration})

        if not normalized:
            raise NoTranscriptFound()

        return normalized
    except TranscriptsDisabled:
        # Clear, actionable error for caller
        raise ValueError(f"Transcripts are disabled for video {video_id}")
    except NoTranscriptFound:
        # Provide a more helpful message so callers (and UI) can explain why ingestion failed
        raise ValueError(
            f"No transcript found for video {video_id}. "
            "This usually means the video has no captions/subtitles available (manual or auto-generated), "
            "or captions are restricted. Consider using a speech-to-text fallback (download audio + transcribe) or "
            "select a different video."
        )
    except Exception as e:
        raise ValueError(f"Failed to fetch transcript for {video_id}: {str(e)}")


def _download_audio(video_url: str, out_dir: str) -> str:
    """Download audio track using yt-dlp (python API when available, else subprocess). Returns audio file path."""
    out_path = os.path.join(out_dir, "audio.wav")

    # Try to use yt_dlp Python module first
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(out_dir, 'audio.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'wav',
                'preferredquality': '192',
            }],
            'quiet': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
        # find downloaded wav
        for fn in os.listdir(out_dir):
            if fn.lower().endswith('.wav'):
                return os.path.join(out_dir, fn)
    except Exception:
        # Fallback to calling yt-dlp via subprocess
        pass

    # subprocess fallback
    try:
        # download best audio as m4a then convert to wav with ffmpeg
        raw_path = os.path.join(out_dir, 'audio_raw.%(ext)s')
        cmd = ['yt-dlp', '-f', 'bestaudio', '-o', raw_path, video_url]
        subprocess.check_call(cmd)
        # find file
        for fn in os.listdir(out_dir):
            if fn.startswith('audio_raw.'):
                rawfile = os.path.join(out_dir, fn)
                # convert to wav
                cmd2 = ['ffmpeg', '-y', '-i', rawfile, out_path]
                subprocess.check_call(cmd2, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return out_path
    except Exception as e:
        raise RuntimeError(f"Audio download failed: {e}")

    raise RuntimeError("Audio download failed: unknown error")


def _transcribe_audio_with_model(audio_path: str) -> List[Dict[str, Any]]:
    """Try faster-whisper, fall back to openai/whisper package if available. Returns list of segments dicts."""
    # Try faster-whisper
    try:
        from faster_whisper import WhisperModel
        import torch
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        model = WhisperModel('small', device=device)
        segments, info = model.transcribe(audio_path, beam_size=5)
        out = []
        for seg in segments:
            out.append({'text': seg.text, 'start': seg.start, 'duration': seg.end - seg.start})
        return out
    except Exception:
        pass

    # Fallback to whisper (OpenAI) python package
    try:
        import whisper
        m = whisper.load_model('small')
        res = m.transcribe(audio_path)
        out = []
        for s in res.get('segments', []):
            out.append({'text': s.get('text', ''), 'start': s.get('start', 0), 'duration': s.get('end', 0) - s.get('start', 0)})
        return out
    except Exception as e:
        raise RuntimeError(f"Transcription failed: {e}")


def transcribe_audio_fallback(video_url: str, video_id: str | None = None, job_id: str | None = None) -> List[Dict[str, Any]]:
    """Download audio and transcribe it. Updates job progress via job_manager if job_id provided."""
    tmpdir = tempfile.mkdtemp(prefix="sitesage_audio_")
    try:
        if job_id:
            update_job(job_id, status='downloading', progress=5)
        audio_path = _download_audio(video_url, tmpdir)

        if job_id:
            update_job(job_id, status='transcribing', progress=30)

        segments = _transcribe_audio_with_model(audio_path)

        if job_id:
            update_job(job_id, status='saving', progress=90)

        # Save transcript cache for reuse
        vid = video_id or (video_url or '').replace('/', '_')[:64]
        cache_dir = os.path.join(os.path.dirname(__file__), '.cache', 'transcripts')
        os.makedirs(cache_dir, exist_ok=True)
        cache_file = os.path.join(cache_dir, f"{vid}.json")
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(segments, f, ensure_ascii=False, indent=2)

        if job_id:
            update_job(job_id, status='done', progress=100, result={'cache_file': cache_file})

        return segments
    finally:
        try:
            shutil.rmtree(tmpdir)
        except Exception:
            pass


def process_transcript(
    transcript: List[Dict[str, Any]], 
    video_url: str,
    site_id: str
) -> List[Dict[str, Any]]:
    """
    Process raw transcript into chunks with metadata.
    
    Each chunk contains:
    - text: The transcript text
    - metadata: source_type, source_url, timestamp, site_id
    
    Args:
        transcript: Raw transcript from youtube-transcript-api
        video_url: Original YouTube video URL
        site_id: Site identifier
    
    Returns:
        List of processed chunks with metadata
    """
    chunks = []
    
    for segment in transcript:
        text = segment['text'].strip()
        start_time = segment['start']
        
        # Skip empty segments
        if not text:
            continue
        
        timestamp = format_timestamp(start_time)
        
        chunk = {
            'text': text,
            'metadata': {
                'source_type': 'youtube',
                'source_url': video_url,
                'timestamp': timestamp,
                'site_id': site_id,
                'start_seconds': start_time  # Keep for potential future use
            }
        }
        
        chunks.append(chunk)
    
    return chunks


def ingest_youtube_video(video_url: str, site_id: str) -> Dict[str, Any]:
    """
    Main ingestion function for YouTube videos.
    
    Steps:
    1. Extract video ID from URL
    2. Fetch transcript using youtube-transcript-api
    3. Process transcript into chunks with metadata
    
    Args:
        video_url: YouTube video URL
        site_id: Site identifier
    
    Returns:
        Dict containing:
        - chunks: List of processed chunks ready for embedding
        - segments_count: Number of transcript segments
        - video_id: Extracted video ID
    
    Raises:
        ValueError: If video ID extraction or transcript fetch fails
    """
    # Extract video ID
    video_id = extract_video_id(video_url)
    
    # Fetch transcript
    transcript = fetch_transcript(video_id)
    
    # Process transcript into chunks
    chunks = process_transcript(transcript, video_url, site_id)
    
    return {
        'chunks': chunks,
        'segments_count': len(chunks),
        'video_id': video_id,
        'source_url': video_url
    }
