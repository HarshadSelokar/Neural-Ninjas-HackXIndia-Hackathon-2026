import threading
import time
import uuid

# Simple in-memory job store. For production use a persistent store (Redis, DB).
_JOBS = {}
_LOCK = threading.Lock()

def create_job(kind: str, meta: dict | None = None) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            'id': job_id,
            'kind': kind,
            'status': 'pending',
            'progress': 0,
            'meta': meta or {},
            'result': None,
            'error': None,
            'created_at': time.time(),
            'updated_at': time.time(),
        }
    return job_id

def update_job(job_id: str, **fields):
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return
        job.update(fields)
        job['updated_at'] = time.time()

def get_job(job_id: str) -> dict | None:
    with _LOCK:
        return _JOBS.get(job_id)

def list_jobs():
    with _LOCK:
        return list(_JOBS.values())
