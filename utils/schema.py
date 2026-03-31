from pydantic import BaseModel


class VideoMetaRequest(BaseModel):
    title:        str | None = None
    channel_name: str | None = None
    headline:     str | None = None
    ticker:       str | None = None
    badge_text:   str | None = None
    enabled:      bool | None = None


class OverlayUpdateRequest(BaseModel):
    channel_name: str | None = None
    headline:     str | None = None
    ticker:       str | None = None
    badge_text:   str | None = None
    enabled:      bool | None = None

