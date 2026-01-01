# backend/main.py

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from jose import jwt, JWTError

from sequences import OPTIONS, SEQUENCE_INDEX, build_catalog

# --------------------
# Config
# --------------------
APP_NAME = "ProAnalyst Labs API"
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-render-env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24h

# Demo user (MVP)
DEMO_USER = os.getenv("DEMO_USER", "admin")
DEMO_PASS = os.getenv("DEMO_PASS", "admin123")

VIDEOS_DIR = os.path.join(os.path.dirname(__file__), "videos")

# CORS
ALLOWED_ORIGINS = [
    "https://proanalyst-labs-mvp.vercel.app",
    "http://localhost:5173",
]

# --------------------
# App
# --------------------
app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --------------------
# In-memory jobs (MVP)
# --------------------
JOBS: Dict[str, Dict] = {}  # job_id -> job data


# --------------------
# JWT helpers
# --------------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    payload = verify_token(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


# --------------------
# Endpoints
# --------------------
@app.get("/status/demo-001")
def status_demo():
    return {"status": "ok", "service": "ProAnalyst Labs API"}


@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    username = form_data.username
    password = form_data.password

    if username != DEMO_USER or password != DEMO_PASS:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_access_token({"sub": username})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/options")
def get_options(user=Depends(get_current_user)):
    # Legacy: mantenemos por compatibilidad
    return OPTIONS


@app.get("/catalog")
def get_catalog(user=Depends(get_current_user)):
    # PRO: la UI debe usar esto para mostrar SOLO combinaciones existentes
    return build_catalog(SEQUENCE_INDEX)


@app.post("/generate")
def generate(payload: dict, user=Depends(get_current_user)):
    """
    payload esperado:
    {
      "own": "4-3-3",
      "opp": "3-5-2",
      "press": "pressing_1"
    }
    """
    own = payload.get("own")
    opp = payload.get("opp")
    press = payload.get("press")

    if not own or not opp or not press:
        raise HTTPException(status_code=400, detail="Missing fields: own/opp/press")

    key = (own, opp, press)
    video_filename = SEQUENCE_INDEX.get(key)

    job_id = str(uuid.uuid4())

    if not video_filename:
        JOBS[job_id] = {
            "status": "no_sequence",
            "created_at": time.time(),
            "own": own,
            "opp": opp,
            "press": press,
        }
        return {"job_id": job_id}

    # guardamos job "done" inmediato (MVP)
    JOBS[job_id] = {
        "status": "done",
        "created_at": time.time(),
        "own": own,
        "opp": opp,
        "press": press,
        "video": video_filename,
        # token simple para video (query param)
        "video_token": create_access_token({"sub": user.get("sub"), "job_id": job_id}, timedelta(minutes=30)),
    }

    return {"job_id": job_id}


@app.get("/status/{job_id}")
def get_job_status(job_id: str, user=Depends(get_current_user)):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    status = job.get("status")

    if status == "done":
        return {
            "status": "done",
            "job_id": job_id,
            "video_url": f"/video/{job_id}?token={job.get('video_token')}",
        }

    if status == "no_sequence":
        return {"status": "no_sequence", "job_id": job_id}

    return {"status": status, "job_id": job_id}


@app.get("/video/{job_id}")
def get_video(job_id: str, token: str = Query(...)):
    # Validar token en query (porque <video> no manda headers)
    payload = verify_token(token)
    token_job_id = payload.get("job_id")
    if token_job_id != job_id:
        raise HTTPException(status_code=401, detail="Invalid video token")

    job = JOBS.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="Video not ready")

    filename = job.get("video")
    if not filename:
        raise HTTPException(status_code=404, detail="Video not found")

    path = os.path.join(VIDEOS_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File missing on server")

    return FileResponse(path, media_type="video/mp4", filename=filename)
