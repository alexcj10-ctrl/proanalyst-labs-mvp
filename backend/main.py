from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles

from jose import jwt, JWTError

from sequences import OPTIONS, SEQUENCE_INDEX, build_catalog


# --------------------
# CONFIG
# --------------------
APP_NAME = "ProAnalyst Labs API"

SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24h

DEMO_USER = os.getenv("DEMO_USER", "admin")
DEMO_PASS = os.getenv("DEMO_PASS", "admin123")

# ✅ Ruta absoluta, robusta en Render
BASE_DIR = Path(__file__).resolve().parent
VIDEOS_DIR = BASE_DIR / "videos"

# CORS: producción + local
ALLOWED_ORIGINS = [
    "https://proanalyst-labs-mvp.vercel.app",
    "http://localhost:5173",
]

# Permitir previews de Vercel SOLO de este proyecto
VERCEL_PREVIEW_REGEX = r"^https:\/\/proanalyst-labs(-.*)?\.vercel\.app$"


# --------------------
# APP
# --------------------
app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=VERCEL_PREVIEW_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# ✅ Static mount para testear vídeos directamente (opcional)
if VIDEOS_DIR.exists():
    app.mount("/videos", StaticFiles(directory=str(VIDEOS_DIR)), name="videos")


# --------------------
# IN-MEMORY JOBS (MVP)
# --------------------
JOBS: Dict[str, Dict] = {}


# --------------------
# JWT HELPERS
# --------------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
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
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


# --------------------
# ENDPOINTS
# --------------------
@app.get("/status/demo-001")
def status_demo():
    return {"status": "ok", "service": "ProAnalyst Labs API"}


@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    if form_data.username != DEMO_USER or form_data.password != DEMO_PASS:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_access_token({"sub": form_data.username})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/options")
def get_options(user=Depends(get_current_user)):
    return OPTIONS


@app.get("/catalog")
def get_catalog(user=Depends(get_current_user)):
    return build_catalog()


@app.post("/generate")
def generate(payload: dict, user=Depends(get_current_user)):
    own = payload.get("own")
    opp = payload.get("opp")
    press = payload.get("press")

    if not own or not opp or not press:
        raise HTTPException(status_code=400, detail="Missing fields")

    job_id = str(uuid.uuid4())
    key = (own, opp, press)

    video_filename = SEQUENCE_INDEX.get(key)

    # ❌ No existe combinación en el catálogo
    if not video_filename:
        JOBS[job_id] = {"status": "no_sequence"}
        return {"job_id": job_id}

    # ❌ Existe combinación pero NO existe el archivo en disco
    path = VIDEOS_DIR / video_filename
    if not path.is_file():
        JOBS[job_id] = {"status": "no_sequence"}
        return {"job_id": job_id}

    video_token = create_access_token(
        {"sub": user["sub"], "job_id": job_id},
        timedelta(minutes=30),
    )

    JOBS[job_id] = {
        "status": "done",
        "video": video_filename,
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
        # ✅ cache-bust: fuerza URL distinta para evitar que Chrome reutilice chunks viejos
        return {
            "status": "done",
            "video_url": f"/video/{job_id}?token={job['video_token']}&v={int(time.time())}",
        }

    return {"status": job["status"]}


@app.get("/video/{job_id}")
def get_video(job_id: str, token: str = Query(...)):
    payload = verify_token(token)
    if payload.get("job_id") != job_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    job = JOBS.get(job_id)
    if not job or job["status"] != "done":
        raise HTTPException(status_code=404, detail="Video not ready")

    path = VIDEOS_DIR / job["video"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path.name}")

    # ✅ Anti-cache total (extra)
    response = FileResponse(str(path), media_type="video/mp4")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response
