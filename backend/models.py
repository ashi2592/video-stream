"""
models.py
---------
SQLAlchemy ORM models for the video platform.
"""

from sqlalchemy import Column, String, Integer, DateTime, Enum, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import enum

Base = declarative_base()


class VideoStatus(str, enum.Enum):
    queued     = "queued"
    processing = "processing"
    uploading  = "uploading"
    ready      = "ready"
    failed     = "failed"


class Video(Base):
    __tablename__ = "videos"

    id         = Column(String(36), primary_key=True)   # UUID
    filename   = Column(String(255), nullable=False)
    title      = Column(String(255))
    status     = Column(Enum(VideoStatus), default=VideoStatus.queued)
    task_id    = Column(String(36))                      # Celery task ID
    duration   = Column(Integer)                         # seconds
    size_bytes = Column(Integer)
    error_msg  = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def to_dict(self):
        return {
            "id":         self.id,
            "filename":   self.filename,
            "title":      self.title,
            "status":     self.status,
            "duration":   self.duration,
            "size_bytes": self.size_bytes,
            "created_at": str(self.created_at),
        }


class LiveStream(Base):
    __tablename__ = "live_streams"

    id          = Column(String(36), primary_key=True)
    stream_key  = Column(String(64), unique=True, nullable=False)
    title       = Column(String(255))
    is_live     = Column(Integer, default=0)   # 0 = offline, 1 = live
    viewer_count = Column(Integer, default=0)
    started_at  = Column(DateTime(timezone=True))
    ended_at    = Column(DateTime(timezone=True))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
