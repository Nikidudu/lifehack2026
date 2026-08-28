"""FastAPI application entry point."""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import router


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=False)


def _allowed_origins() -> list[str]:
    configured_origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173",
    )
    return [origin.strip() for origin in configured_origins.split(",") if origin.strip()]


app = FastAPI(title="AI Commerce Readiness API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a safe response without exposing internal exception details."""
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health() -> dict[str, str]:
    """Report whether the API process is healthy."""
    return {"status": "ok"}
