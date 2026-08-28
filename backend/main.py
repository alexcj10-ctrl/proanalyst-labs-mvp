from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from sequences import OPTIONS, SEQUENCE_INDEX, build_catalog, get_solution_metadata

APP_NAME = "ProAnalyst Labs API"
APP_VERSION = "1.1.0"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
VIDEO_TOKEN_EXPIRE_MINUTES = 30

BASE_DIR = Path(__file__).resolve().parent
VIDEOS_DIR = BASE_DIR / "videos"
EVENTS_FILE = Path(os.getenv("EVENTS_FILE", str(BASE_DIR / ".runtime" / "events.jsonl")))

# Do not ship a fixed production secret in source control. If Render/Vercel is
# configured correctly, SECRET_KEY is provided by the environment. The random
# fallback is intentionally suitable only for local/demo processes.
SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_urlsafe(48)
STAFF_USER = os.getenv("STAFF_USER", "admin")
STAFF_PASS = os.getenv("STAFF_PASS") or secrets.token_urlsafe(24)
ENABLE_DEBUG_ENDPOINTS = os.getenv("ENABLE_DEBUG_ENDPOINTS", "false").lower() == "true"

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://proanalyst-labs-mvp.vercel.app,http://localhost:5173",
    ).split(",")
    if origin.strip()
]
VERCEL_PREVIEW_REGEX = os.getenv(
    "ALLOWED_ORIGIN_REGEX", r"^https:\/\/proanalyst-labs(-.*)?\.vercel\.app$"
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("proanalyst")
if not os.getenv("SECRET_KEY"):
    logger.warning("SECRET_KEY is not configured. Using an ephemeral development key.")
if not os.getenv("STAFF_PASS"):
    logger.warning("STAFF_PASS is not configured. Staff login is using an ephemeral password; use /demo-login for local demo access.")

app = FastAPI(title=APP_NAME, version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=VERCEL_PREVIEW_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

# In-memory jobs are adequate for the deterministic MVP. The API surface is
# structured so a persistent queue/database can replace this later.
JOBS: Dict[str, Dict] = {}


class TacticalRequest(BaseModel):
    phase: str = Field(min_length=1, max_length=40)
    own: str = Field(min_length=1, max_length=20)
    opp: str = Field(min_length=1, max_length=20)
    variant: Optional[str] = Field(default=None, min_length=1, max_length=12)
    # Backward compatibility with the old frontend.
    press: Optional[str] = Field(default=None, min_length=1, max_length=12)

    def resolved_variant(self) -> str:
        value = self.variant or self.press
        if not value:
            raise HTTPException(status_code=400, detail="Missing variant")
        return value


class ScenarioRequest(BaseModel):
    phase: str = Field(min_length=1, max_length=40)
    own: str = Field(min_length=1, max_length=20)
    opp: str = Field(min_length=1, max_length=20)
    note: str = Field(default="", max_length=800)


class FeedbackRequest(BaseModel):
    scenario_id: str = Field(min_length=1, max_length=120)
    useful: bool
    note: str = Field(default="", max_length=1200)


class DemoTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


def _append_event(event: dict) -> None:
    try:
        EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with EVENTS_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError as exc:
        logger.warning("Could not append runtime event: %s", exc)


def _read_events() -> list[dict]:
    if not EVENTS_FILE.is_file():
        return []
    events = []
    try:
        with EVENTS_FILE.open("r", encoding="utf-8") as f:
            for line in f:
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError as exc:
        logger.warning("Could not read runtime events: %s", exc)
    return events


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    payload = verify_token(token)
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


def get_staff_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "staff":
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


def _require_debug() -> None:
    if not ENABLE_DEBUG_ENDPOINTS:
        raise HTTPException(status_code=404, detail="Not found")


@app.get("/")
def root():
    return {"status": "ok", "service": APP_NAME, "version": APP_VERSION}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "videos": len(list(VIDEOS_DIR.glob("*.mp4"))) if VIDEOS_DIR.exists() else 0,
        "catalog_entries": len(SEQUENCE_INDEX),
    }


@app.get("/status/demo-001")
def status_demo():
    return {"status": "ok", "service": APP_NAME, "version": APP_VERSION}


# -------------------- AUTH --------------------
@app.post("/demo-login", response_model=DemoTokenResponse)
def demo_login():
    """One-click public demo access without exposing credentials in the UI."""
    return DemoTokenResponse(
        access_token=create_access_token({"sub": "demo", "role": "demo"})
    )


@app.post("/login", response_model=DemoTokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    if not STAFF_USER or not STAFF_PASS:
        raise HTTPException(status_code=503, detail="Staff login is not configured")
    if form_data.username != STAFF_USER or form_data.password != STAFF_PASS:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return DemoTokenResponse(
        access_token=create_access_token({"sub": form_data.username, "role": "staff"})
    )


# -------------------- CATALOG --------------------
@app.get("/options")
def get_options(user=Depends(get_current_user)):
    return OPTIONS


@app.get("/catalog")
def get_catalog(user=Depends(get_current_user)):
    return build_catalog()


@app.post("/generate")
def generate(payload: TacticalRequest, user=Depends(get_current_user)):
    # Prevent unbounded growth of the in-memory MVP job registry.
    cutoff = time.time() - (2 * 60 * 60)
    for old_job_id in [jid for jid, item in JOBS.items() if item.get("created_at", 0) < cutoff]:
        JOBS.pop(old_job_id, None)

    phase = payload.phase
    own = payload.own
    opp = payload.opp
    variant = payload.resolved_variant()
    job_id = str(uuid.uuid4())
    key = (phase, own, opp, variant)
    video_filename = SEQUENCE_INDEX.get(key)

    if not video_filename:
        JOBS[job_id] = {
            "status": "no_sequence",
            "phase": phase,
            "own": own,
            "opp": opp,
            "variant": variant,
            "created_at": time.time(),
        }
        return {"job_id": job_id}

    path = VIDEOS_DIR / video_filename
    if not path.is_file():
        JOBS[job_id] = {
            "status": "no_sequence",
            "phase": phase,
            "own": own,
            "opp": opp,
            "variant": variant,
            "created_at": time.time(),
        }
        return {"job_id": job_id}

    video_token = create_access_token(
        {"sub": user["sub"], "job_id": job_id, "scope": "video"},
        timedelta(minutes=VIDEO_TOKEN_EXPIRE_MINUTES),
    )

    JOBS[job_id] = {
        "status": "done",
        "video": video_filename,
        "phase": phase,
        "own": own,
        "opp": opp,
        "variant": variant,
        "video_token": video_token,
        "created_at": time.time(),
    }
    return {"job_id": job_id}


@app.get("/status/{job_id}")
def get_status(job_id: str, user=Depends(get_current_user)):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] == "done":
        path = VIDEOS_DIR / job["video"]
        if not path.is_file():
            return {"status": "no_sequence"}
        st = path.stat()
        file_ver = f"{int(st.st_mtime)}-{st.st_size}"
        solution = get_solution_metadata(
            job["phase"], job["own"], job["opp"], job["variant"]
        )
        return {
            "status": "done",
            "video": job["video"],
            "phase": job["phase"],
            "own": job["own"],
            "opp": job["opp"],
            "variant": job["variant"],
            "solution": solution,
            "video_url": f"/video/{job_id}?token={job['video_token']}&file={file_ver}",
        }

    return {"status": job["status"]}


@app.get("/video/{job_id}")
def get_video(job_id: str, request: Request, token: str = Query(...)):
    payload = verify_token(token)
    if payload.get("job_id") != job_id or payload.get("scope") != "video":
        raise HTTPException(status_code=401, detail="Invalid token")

    job = JOBS.get(job_id)
    if not job or job["status"] != "done":
        raise HTTPException(status_code=404, detail="Video not ready")

    path = VIDEOS_DIR / job["video"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path.name}")

    file_size = path.stat().st_size
    range_header = request.headers.get("range")
    common_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    if not range_header:
        return FileResponse(path=str(path), media_type="video/mp4", headers=common_headers)

    try:
        unit, range_value = range_header.strip().split("=", 1)
        if unit.lower() != "bytes" or "," in range_value:
            raise ValueError
        start_text, end_text = range_value.split("-", 1)
        if start_text:
            start_byte = int(start_text)
            end_byte = int(end_text) if end_text else file_size - 1
        else:
            # Suffix range: bytes=-500 means the final 500 bytes.
            suffix_length = int(end_text)
            if suffix_length <= 0:
                raise ValueError
            start_byte = max(file_size - suffix_length, 0)
            end_byte = file_size - 1

        if start_byte < 0 or start_byte >= file_size:
            raise ValueError
        end_byte = min(end_byte, file_size - 1)
        if end_byte < start_byte:
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=416,
            detail="Invalid range",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    content_length = end_byte - start_byte + 1

    def iter_file():
        with path.open("rb") as f:
            f.seek(start_byte)
            remaining = content_length
            while remaining > 0:
                chunk = f.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        **common_headers,
        "Content-Range": f"bytes {start_byte}-{end_byte}/{file_size}",
        "Content-Length": str(content_length),
    }
    return StreamingResponse(iter_file(), status_code=206, media_type="video/mp4", headers=headers)


# -------------------- PRODUCT LEARNING --------------------
@app.post("/scenario-requests")
def request_scenario(payload: ScenarioRequest, user=Depends(get_current_user)):
    event = {
        "type": "scenario_request",
        "user": user.get("sub"),
        "phase": payload.phase,
        "own": payload.own,
        "opp": payload.opp,
        "note": payload.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _append_event(event)
    return {"status": "recorded"}


@app.post("/feedback")
def submit_feedback(payload: FeedbackRequest, user=Depends(get_current_user)):
    event = {
        "type": "feedback",
        "user": user.get("sub"),
        "scenario_id": payload.scenario_id,
        "useful": payload.useful,
        "note": payload.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _append_event(event)
    return {"status": "recorded"}


@app.get("/insights")
def insights(user=Depends(get_staff_user)):
    events = _read_events()
    requests = [e for e in events if e.get("type") == "scenario_request"]
    feedback = [e for e in events if e.get("type") == "feedback"]
    request_counts = Counter(
        f"{e.get('phase')}|{e.get('own')}|{e.get('opp')}" for e in requests
    )
    feedback_positive = sum(1 for e in feedback if e.get("useful") is True)
    return {
        "scenario_requests": len(requests),
        "feedback_count": len(feedback),
        "positive_feedback": feedback_positive,
        "top_requested_scenarios": request_counts.most_common(10),
        "note": "MVP telemetry is file-backed on the current service instance. Connect a durable database before relying on it for production analytics.",
    }


# -------------------- DEBUG (disabled by default) --------------------
@app.get("/debug/info")
def debug_info(user=Depends(get_staff_user)):
    _require_debug()
    return {
        "service": APP_NAME,
        "version": APP_VERSION,
        "catalog_entries": len(SEQUENCE_INDEX),
        "videos_dir_exists": VIDEOS_DIR.exists(),
        "debug_enabled": ENABLE_DEBUG_ENDPOINTS,
        "staff_login_configured": bool(STAFF_USER and STAFF_PASS),
    }


@app.get("/debug/build")
def debug_build(user=Depends(get_staff_user)):
    _require_debug()
    return {
        "render_git_commit": os.getenv("RENDER_GIT_COMMIT"),
        "videos_dir": str(VIDEOS_DIR),
        "videos_dir_exists": VIDEOS_DIR.exists(),
    }


@app.get("/debug/videos")
def debug_videos(user=Depends(get_staff_user)):
    _require_debug()
    if not VIDEOS_DIR.exists():
        return {"error": "VIDEOS_DIR does not exist", "videos_dir": str(VIDEOS_DIR)}
    items = []
    for p in sorted(VIDEOS_DIR.glob("*.mp4")):
        st = p.stat()
        items.append({"name": p.name, "size": st.st_size, "mtime": int(st.st_mtime)})
    return {"count": len(items), "files": items}


@app.get("/debug/video-hash")
def debug_video_hash(name: str, user=Depends(get_staff_user)):
    _require_debug()
    path = VIDEOS_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {name}")
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    st = path.stat()
    return {
        "name": path.name,
        "size": st.st_size,
        "mtime": int(st.st_mtime),
        "sha256": h.hexdigest(),
    }
