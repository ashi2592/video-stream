from pydantic import BaseModel
from typing import List, Optional

class SEOModel(BaseModel):
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    keywords: Optional[List[str]] = []

class VideoMetaRequest(BaseModel):
    title: Optional[str]
    description: Optional[str]   # ✅ NEW
    meta_tags: Optional[List[str]] = []  # ✅ NEW
    seo: Optional[SEOModel] = None

    # existing overlay fields...
    channel_name: Optional[str]
    headline: Optional[str]
    ticker: Optional[str]
    badge_text: Optional[str]
    enabled: Optional[bool]


class OverlayUpdateRequest(BaseModel):
    channel_name: str | None = None
    headline:     str | None = None
    ticker:       str | None = None
    badge_text:   str | None = None
    enabled:      bool | None = None

