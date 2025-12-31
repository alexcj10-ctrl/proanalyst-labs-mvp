from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel

from sequences import OPTIONS, SEQUENCE_INDEX

# =========================
# AUTH CONFIG (DEV)
# =========================

SECRET_KEY = "DEV_SECRET_CHANGE_LATER"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24h

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# DEV ONLY: usuario único, sin hash (evita errores y reload issues)
ADMIN_USER = {
    "username": "admin",
    "password": "admin123",
}

# =========================
# APP
# =========================

app = FastAPI(title="ProAnalyst Labs API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://proanalyst-labs-mvp.vercel.app",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # DEV
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# job_id -> job data
JOBS: Dict[str, Dict[str, Any]] = {}

# =========================
# MODELS
# =========================


class GenerateRequest(BaseModel):
    own: str
    opp: str
    press: str


class Token(BaseModel):
    access_token: str
    token_type: str


# =========================
# AUTH HELPERS
# =========================


def authenticate_user(username: str, password: str) -> Optional[Dict[str, str]]:
    if username != ADMIN_USER["username"]:
        return None
    if password != ADMIN_USER["password"]:
        return None
    return {"username": username}


def create_access_token(data: Dict[str, Any], expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username != ADMIN_USER["username"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return {"username": username}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


def _validate_token_from_query(token: str) -> None:
    """Validar token manualmente (porque <video> no manda headers)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username != ADMIN_USER["username"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


# =========================
# ROUTES
# =========================


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok", "service": "ProAnalyst Labs API"}


@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Dict[str, str]:
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    token = create_access_token(
        data={"sub": user["username"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
def me(current_user: Dict[str, str] = Depends(get_current_user)) -> Dict[str, str]:
    return current_user


# =========================
# APP LOGIC (PROTECTED)
# =========================


@app.get("/options")
def options(current_user: Dict[str, str] = Depends(get_current_user)) -> Any:
    return OPTIONS


@app.post("/generate")
def generate(
    payload: GenerateRequest,
    current_user: Dict[str, str] = Depends(get_current_user),
) -> Dict[str, str]:
    job_id = str(uuid.uuid4())
    key = (payload.own, payload.opp, payload.press)
    sequence_filename = SEQUENCE_INDEX.get(key)

    if not sequence_filename:
        JOBS[job_id] = {
            "status": "no_sequence",
            "sequence_id": None,
            "video_url": None,
        }
        return {"job_id": job_id}

    # Simula procesado (MVP)
    time.sleep(1)

    JOBS[job_id] = {
        "status": "done",
        "sequence_id": sequence_filename,
        "video_url": f"/video/{job_id}",
    }
    return {"job_id": job_id}


@app.get("/status/{job_id}")
def get_status(
    job_id: str,
    current_user: Dict[str, str] = Depends(get_current_user),
) -> Dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        return {"status": "not_found"}
    return job


# =========================
# VIDEO (TOKEN VIA QUERY)
# =========================


@app.get("/video/{job_id}")
def get_video(
    job_id: str,
    token: Optional[str] = Query(default=None),
) -> FileResponse:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing token",
        )

    _validate_token_from_query(token)

    job = JOBS.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not ready",
        )

    base_dir = os.path.dirname(__file__)
    video_path = os.path.join(base_dir, "videos", job["sequence_id"])

    if not os.path.exists(video_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Missing video file",
        )

    return FileResponse(video_path, media_type="video/mp4")
