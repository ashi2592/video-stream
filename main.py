# main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.stream_router import router as stream_router
from routers.video_router import router as video_router
from routers.templates_router import router as templates_router

from fastapi.staticfiles import StaticFiles
from config.config import OUTPUT_DIR


app = FastAPI(title="Video Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(stream_router)
app.include_router(video_router)
app.include_router(templates_router)

app.mount("/", StaticFiles(directory=OUTPUT_DIR), name="outputs")