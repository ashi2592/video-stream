"""
routers/templates_router.py — Overlay template CRUD router with MongoDB.

Features:
  • Full CRUD operations (Create, Read, Update, Delete)
  • Template duplication/clone
  • Search by name and filter by tags
  • Partial updates for both root fields and nested config
  • Pagination support (skip/limit)
  • Proper error handling with HTTPException
  • ObjectId validation

Mount in main.py:
    from routers.templates_router import router as templates_router
    app.include_router(templates_router)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, List, Dict
from enum import Enum

from bson import ObjectId
from fastapi import APIRouter, Body, HTTPException, Query, status
from pymongo import ReturnDocument  # FIX #10: was missing
from pydantic import BaseModel, Field, field_validator

from utils.mongo_model import templates_collection

router = APIRouter(prefix="/templates", tags=["Overlay Templates"])


# ============================================================================
# Enums & Constants
# ============================================================================

class LayoutType(str, Enum):
    SINGLE = "single"
    SPLIT_V = "split-v"
    SPLIT_H = "split-h"
    TRIPLE = "triple"
    TRIPLE_COL = "triple-col"
    TRIPLE_ROW = "triple-row"
    FEATURED = "featured"


class ContentType(str, Enum):
    VIDEO = "video"
    IMAGE = "image"
    TEXT = "text"
    CAROUSEL = "carousel"
    LIVESTREAM = "livestream"


class AudioSourceType(str, Enum):
    NONE = "none"
    UPLOAD = "upload"
    TEXT_TO_SPEECH = "text-to-speech"


# ============================================================================
# Helper Functions
# ============================================================================

def to_str_id(doc: dict) -> dict:
    """Convert MongoDB ObjectId to string 'id' field."""
    if doc and "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


def get_or_404(template_id: str) -> dict:
    """Fetch template by ID or raise 404. Validates ObjectId format."""
    try:
        oid = ObjectId(template_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid template ID format."
        )

    doc = templates_collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found."
        )
    return doc


def validate_layout(layout: str) -> str:
    """Validate layout string against allowed values."""
    allowed = {"single", "split-v", "split-h", "triple", "triple-col", "triple-row", "featured"}
    if layout not in allowed:
        raise ValueError(f"layout must be one of {allowed}")
    return layout


# ============================================================================
# Pydantic Schemas
# ============================================================================

class VoiceOverConfigSchema(BaseModel):
    """Voice-over configuration."""
    enabled: bool = False
    source_type: AudioSourceType = AudioSourceType.NONE
    audio_url: Optional[str] = None
    audio_file_name: Optional[str] = None
    tts_text: str = "Welcome to our broadcast. Stay tuned for the latest updates."
    tts_voice: str = "en-US-JennyNeural"
    tts_speed: float = Field(default=1.0, ge=0.5, le=2.0)
    tts_pitch: float = Field(default=1.0, ge=0.5, le=2.0)
    volume: float = Field(default=0.8, ge=0.0, le=1.0)

    model_config = {"use_enum_values": True}


class BackgroundMusicConfigSchema(BaseModel):
    """Background music configuration."""
    enabled: bool = False
    audio_url: Optional[str] = None
    audio_file_name: Optional[str] = None
    volume: float = Field(default=0.3, ge=0.0, le=1.0)
    loop: bool = True
    start_offset: int = Field(default=0, ge=0)


# FIX #1: Removed broken Pydantic v1-style SlotContentMap (__root__ is not
# supported in Pydantic v2). Use a plain type alias instead.
SlotContentMap = Dict[int, ContentType]


class OverlayConfigSchema(BaseModel):
    """Complete overlay configuration matching frontend structure."""

    # Screen dimensions
    width: int = Field(default=1280, ge=320, le=3840)
    height: int = Field(default=720, ge=240, le=2160)

    # Layout
    layout_id: LayoutType = LayoutType.SINGLE
    # FIX #7: Use a lambda that returns ContentType enum members safely.
    slot_contents: Dict[int, ContentType] = Field(
        default_factory=lambda: {0: ContentType.VIDEO}
    )

    # Header / Channel
    channel_name: str = "NEWS 24"
    show_logo: bool = False
    logo_text: str = ""
    logo_image: Optional[str] = None

    # Headline bar
    headline: str = "BREAKING: Major earthquake strikes Pacific coast"
    badge_text: str = "BREAKING"
    badge_color: str = "#e74c3c"

    # Lower highlight
    show_highlight: bool = True
    highlight_text: str = "🌐 Special coverage: Live updates from the scene"
    highlight_bg_color: str = "#2c3e50"
    highlight_text_color: str = "#ffffff"

    # Ticker
    show_ticker: bool = True
    ticker_text: str = "Markets fall 3% • Tech stocks lead decline • Oil prices surge • More updates coming"
    ticker_color: str = "#f1c40f"
    ticker_bg_color: str = "#1a1a2e"
    ticker_speed: int = Field(default=80, ge=30, le=200)

    # Style
    top_bar_color: str = "#1a1a2e"
    headline_bar_color: str = "#c0392b"
    show_border: bool = True
    border_color: str = "#c0392b"

    # Audio features
    voice_over: VoiceOverConfigSchema = Field(default_factory=VoiceOverConfigSchema)
    background_music: BackgroundMusicConfigSchema = Field(default_factory=BackgroundMusicConfigSchema)

    @field_validator("layout_id", mode="before")
    @classmethod
    def validate_layout_id(cls, v):
        if isinstance(v, str):
            validate_layout(v)
        return v

    model_config = {"use_enum_values": True}


class TemplateCreate(BaseModel):
    """Request schema for creating a new template."""
    name: str = Field(..., min_length=1, max_length=200)
    config: OverlayConfigSchema
    tags: List[str] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    """Request schema for updating a template (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    config: Optional[OverlayConfigSchema] = None  # Replaces the entire config block
    tags: Optional[List[str]] = None


# FIX #8: Added a dedicated schema for patching individual config fields,
# replacing the unsafe bare `dict` body parameter.
class ConfigPatchBody(BaseModel):
    """Arbitrary key/value pairs to patch into the overlay config."""
    fields: Dict[str, Any] = Field(
        ...,
        description="Keys must be valid OverlayConfigSchema field names.",
        examples=[{"headline": "New headline", "ticker_speed": 120, "show_ticker": False}],
    )


class BatchDeleteBody(BaseModel):
    """Request body for batch-deleting templates."""
    template_ids: List[str] = Field(..., min_length=1)


class TemplateResponse(BaseModel):
    """Response schema for template data."""
    id: str
    name: str
    config: OverlayConfigSchema
    tags: List[str]
    created_at: datetime
    updated_at: datetime


class TemplateListResponse(BaseModel):
    """Response schema for paginated template list."""
    total: int
    skip: int
    limit: int
    items: List[TemplateResponse]


# ============================================================================
# Utility Routes — MUST be declared before /{template_id} routes
# FIX #3: Static paths /tags/all and /stats were unreachable because FastAPI
# matched them as template IDs. Declaring them first fixes the ordering.
# ============================================================================

@router.get(
    "/tags/all",
    summary="Get all unique tags from templates"
)
def get_all_tags():
    """
    Retrieve a list of all unique tags used across templates.
    Useful for tag filtering UI.
    """
    pipeline = [
        {"$unwind": {"path": "$tags", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$tags"}},
        {"$sort": {"_id": 1}}
    ]

    result = list(templates_collection.aggregate(pipeline))
    tags = [doc["_id"] for doc in result if doc["_id"]]

    return {"tags": tags}


@router.get(
    "/stats",
    summary="Get template statistics"
)
def get_template_stats():
    """
    Get statistics about templates in the database.
    """
    total = templates_collection.count_documents({})

    layout_pipeline = [
        {"$group": {"_id": "$config.layout_id", "count": {"$sum": 1}}}
    ]
    layout_stats = list(templates_collection.aggregate(layout_pipeline))

    recent = list(
        templates_collection
        .find({}, {"name": 1, "updated_at": 1})
        .sort("updated_at", -1)
        .limit(5)
    )

    return {
        "total_templates": total,
        "by_layout": {item["_id"]: item["count"] for item in layout_stats if item["_id"]},
        "recent_templates": [
            {"id": str(doc["_id"]), "name": doc["name"], "updated_at": doc["updated_at"]}
            for doc in recent
        ]
    }


# FIX #2 & #9: The original DELETE /batch route was declared after /{template_id}
# and was therefore unreachable (FastAPI matched "batch" as a template ID).
# Switched to POST /batch-delete with a proper request body, which also avoids
# the unreliable practice of sending a body with a DELETE request.
@router.post(
    "/batch-delete",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete multiple templates"
)
def delete_templates_batch(body: BatchDeleteBody):
    """
    Delete multiple templates by their IDs.

    Send a JSON body:
        { "template_ids": ["<id1>", "<id2>", ...] }
    """
    object_ids = []
    for tid in body.template_ids:
        try:
            object_ids.append(ObjectId(tid))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid template ID: {tid}"
            )

    result = templates_collection.delete_many({"_id": {"$in": object_ids}})

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No templates found with the provided IDs."
        )

    return None


# ============================================================================
# Collection-level Routes
# ============================================================================

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=TemplateResponse,
    summary="Create a new overlay template"
)
def create_template(body: TemplateCreate):
    """
    Create a new overlay template with the provided configuration.
    """
    now = datetime.utcnow()

    config_dict = body.config.model_dump(exclude_none=False, mode="json")

    doc = {
        "name": body.name.strip(),
        "config": config_dict,
        "tags": body.tags,
        "created_at": now,
        "updated_at": now,
    }

    result = templates_collection.insert_one(doc)
    doc["_id"] = result.inserted_id

    return to_str_id(doc)


@router.get(
    "",
    response_model=TemplateListResponse,
    summary="List templates with filtering and pagination"
)
def list_templates(
    tag: Optional[str] = Query(None, description="Filter by tag (exact match)"),
    search: Optional[str] = Query(None, description="Search by name (case-insensitive partial match)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum records to return"),
):
    """
    Retrieve a list of templates with optional filtering and pagination.

    - **tag**: Filter templates that have this specific tag
    - **search**: Case-insensitive partial match on template name
    - **skip**: Pagination offset
    - **limit**: Maximum number of results (1–100)
    """
    query: Dict[str, Any] = {}

    if tag:
        query["tags"] = tag

    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    total = templates_collection.count_documents(query)

    cursor = (
        templates_collection
        .find(query)
        .sort("updated_at", -1)
        .skip(skip)
        .limit(limit)
    )

    items = [to_str_id(doc) for doc in cursor]

    return TemplateListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items
    )


# ============================================================================
# Item-level Routes — all /{template_id} paths grouped here
# ============================================================================

@router.get(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="Get a single template by ID"
)
def get_template(template_id: str):
    """
    Retrieve a specific template by its ID.
    """
    doc = get_or_404(template_id)
    return to_str_id(doc)


@router.patch(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="Partially update a template"
)
def update_template(template_id: str, body: TemplateUpdate):
    """
    Update a template's name, config, or tags.
    Only provided fields will be updated.
    Supplying `config` replaces the entire config sub-document.
    """
    get_or_404(template_id)

    updates: Dict[str, Any] = {"updated_at": datetime.utcnow()}

    if body.name is not None:
        updates["name"] = body.name.strip()

    if body.tags is not None:
        updates["tags"] = body.tags

    if body.config is not None:
        updates["config"] = body.config.model_dump(exclude_none=False, mode="json")

    if len(updates) == 1:  # Only updated_at — nothing meaningful to change
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update. Provide name, config, or tags."
        )

    # FIX #6: return_document=True is not valid pymongo syntax.
    # Must use ReturnDocument.AFTER from pymongo.
    updated = templates_collection.find_one_and_update(
        {"_id": ObjectId(template_id)},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )

    return to_str_id(updated)


@router.patch(
    "/{template_id}/config",
    response_model=TemplateResponse,
    summary="Patch individual overlay config fields"
)
# FIX #5 & #8: Replaced bare `dict` body with a typed Pydantic model.
# FastAPI cannot properly parse/document a raw `dict` parameter.
def patch_overlay_config(template_id: str, body: ConfigPatchBody):
    """
    Patch specific fields in the overlay configuration.
    Any field from OverlayConfigSchema can be updated.

    Example request body:
    ```json
    {
        "fields": {
            "headline": "New breaking news headline",
            "ticker_speed": 120,
            "show_ticker": false
        }
    }
    ```
    """
    if not body.fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update."
        )

    get_or_404(template_id)

    set_payload = {f"config.{k}": v for k, v in body.fields.items()}
    set_payload["updated_at"] = datetime.utcnow()

    # FIX #6: ReturnDocument.AFTER instead of return_document=True
    updated = templates_collection.find_one_and_update(
        {"_id": ObjectId(template_id)},
        {"$set": set_payload},
        return_document=ReturnDocument.AFTER,
    )

    return to_str_id(updated)


@router.post(
    "/{template_id}/duplicate",
    status_code=status.HTTP_201_CREATED,
    response_model=TemplateResponse,
    summary="Duplicate/clone an existing template"
)
# FIX #4: Annotate new_name with Query(...) so FastAPI documents and validates it
# correctly as a query parameter rather than treating it as a body.
def duplicate_template(
    template_id: str,
    new_name: Optional[str] = Query(None, description="Custom name for the clone. Defaults to '<original> (copy)'."),
):
    """
    Create a copy of an existing template.

    - **new_name**: Optional custom name for the cloned template.
      If not provided, appends " (copy)" to the original name.
    """
    original = get_or_404(template_id)

    now = datetime.utcnow()

    original.pop("_id", None)

    original["name"] = new_name.strip() if new_name else f"{original['name']} (copy)"
    original["created_at"] = now
    original["updated_at"] = now

    result = templates_collection.insert_one(original)
    original["_id"] = result.inserted_id

    return to_str_id(original)


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a template"
)
def delete_template(template_id: str):
    """
    Permanently delete a template by its ID.
    """
    get_or_404(template_id)

    templates_collection.delete_one({"_id": ObjectId(template_id)})

    return None