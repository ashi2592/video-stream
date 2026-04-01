"""
routers/templates_router.py — Overlay template CRUD router.

Follows the same pattern as videos_router.py:
  • sync pymongo via shared mongo_model helpers
  • APIRouter with prefix + tags
  • HTTPException for all error paths
  • model_dump / exclude_none for partial updates

Mount in main.py:
    from routers.templates_router import router as templates_router
    app.include_router(templates_router)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from utils.mongo_model import templates_collection  # ← add this to mongo_model.py (see bottom of file)

router = APIRouter(prefix="/templates", tags=["Overlay Templates"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_str_id(doc: dict) -> dict:
    """Convert ObjectId _id → plain string id, in-place."""
    doc["id"] = str(doc.pop("_id"))
    return doc


def _get_or_404(template_id: str) -> dict:
    """Fetch a template document or raise 404. Also validates the ObjectId."""
    try:
        oid = ObjectId(template_id)
    except Exception:
        raise HTTPException(400, "Invalid template ID.")
    doc = templates_collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Template not found.")
    return doc


# ── Schemas ───────────────────────────────────────────────────────────────────

class OverlayConfigSchema(BaseModel):
    """All tuneable overlay parameters — mirrors the frontend config object."""

    layout: str = "single"          # single | split-v | split-h | triple

    # Branding
    channel_name: str          = "NEWS 24"
    show_logo:    bool         = False
    logo_text:    Optional[str] = None
    logo_image:   Optional[str] = None   # base64 data-URL (small logos only)

    # Content
    headline:    str = "BREAKING NEWS"
    badge_text:  str = "BREAKING"
    badge_color: str = "#e74c3c"

    # Ticker
    show_ticker:  bool = True
    ticker_text:  str  = "Latest updates • Stay tuned for more"
    ticker_color: str  = "#f1c40f"
    ticker_bg:    str  = "#2c3e50"
    ticker_speed: int  = 80

    # Colours
    top_bar_color:    str = "#1a1a2e"
    bottom_bar_color: str = "#c0392b"

    # Border
    show_border:  bool = True
    border_color: str  = "#c0392b"

    @field_validator("layout")
    @classmethod
    def _valid_layout(cls, v: str) -> str:
        allowed = {"single", "split-v", "split-h", "triple"}
        if v not in allowed:
            raise ValueError(f"layout must be one of {allowed}")
        return v


class TemplateCreate(BaseModel):
    name:   str
    config: OverlayConfigSchema
    tags:   list[str] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    """All fields optional — only supplied fields are written."""
    name:   Optional[str]                  = None
    config: Optional[OverlayConfigSchema]  = None
    tags:   Optional[list[str]]            = None


class OverlayConfigUpdate(BaseModel):
    """Partial overlay config patch — mirrors OverlayUpdateRequest in videos_router."""
    layout:           Optional[str]  = None
    channel_name:     Optional[str]  = None
    show_logo:        Optional[bool] = None
    logo_text:        Optional[str]  = None
    logo_image:       Optional[str]  = None
    headline:         Optional[str]  = None
    badge_text:       Optional[str]  = None
    badge_color:      Optional[str]  = None
    show_ticker:      Optional[bool] = None
    ticker_text:      Optional[str]  = None
    ticker_color:     Optional[str]  = None
    ticker_bg:        Optional[str]  = None
    ticker_speed:     Optional[int]  = None
    top_bar_color:    Optional[str]  = None
    bottom_bar_color: Optional[str]  = None
    show_border:      Optional[bool] = None
    border_color:     Optional[str]  = None


# ── Routes ────────────────────────────────────────────────────────────────────

# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201, summary="Create a new overlay template")
def create_template(body: TemplateCreate):
    now = datetime.utcnow()
    doc = {
        "name":       body.name,
        "config":     body.config.model_dump(),
        "tags":       body.tags,
        "created_at": now,
        "updated_at": now,
    }
    result = templates_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_str_id(doc)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", summary="List templates (supports tag filter + name search)")
def list_templates(
    tag:    Optional[str] = Query(None, description="Filter by tag"),
    search: Optional[str] = Query(None, description="Partial name search (case-insensitive)"),
    skip:   int           = Query(0,  ge=0),
    limit:  int           = Query(20, ge=1, le=100),
):
    query: dict[str, Any] = {}
    if tag:
        query["tags"] = tag
    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    cursor = (
        templates_collection
        .find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    return [_to_str_id(d) for d in cursor]


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{template_id}", summary="Get a single template by ID")
def get_template(template_id: str):
    doc = _get_or_404(template_id)
    return _to_str_id(doc)


# ── Full update ───────────────────────────────────────────────────────────────

@router.patch("/{template_id}", summary="Partially update name / config / tags")
def update_template(template_id: str, body: TemplateUpdate):
    doc = _get_or_404(template_id)   # validates ID + existence

    updates: dict[str, Any] = {"updated_at": datetime.utcnow()}
    if body.name   is not None: updates["name"]   = body.name
    if body.tags   is not None: updates["tags"]   = body.tags
    if body.config is not None: updates["config"] = body.config.model_dump()

    if len(updates) == 1:
        raise HTTPException(400, "No fields to update.")

    updated = templates_collection.find_one_and_update(
        {"_id": ObjectId(template_id)},
        {"$set": updates},
        return_document=True,          # pymongo: ReturnDocument.AFTER = True
    )
    return _to_str_id(updated)


# ── Overlay-only patch (mirrors /video/{id}/overlay) ─────────────────────────

@router.patch("/{template_id}/overlay", summary="Patch individual overlay config fields")
def patch_overlay(template_id: str, body: OverlayConfigUpdate):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(400, "No overlay fields supplied.")

    _get_or_404(template_id)   # existence check

    # Nest each field under the config sub-document
    set_payload = {f"config.{k}": v for k, v in fields.items()}
    set_payload["updated_at"] = datetime.utcnow()

    updated = templates_collection.find_one_and_update(
        {"_id": ObjectId(template_id)},
        {"$set": set_payload},
        return_document=True,
    )
    return {
        "template_id": template_id,
        "config":      updated.get("config"),
        "message":     "Overlay config patched.",
    }


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{template_id}", status_code=204, summary="Delete a template")
def delete_template(template_id: str):
    _get_or_404(template_id)
    templates_collection.delete_one({"_id": ObjectId(template_id)})


# ── Duplicate (mirrors video flow: create new doc from existing) ──────────────

@router.post("/{template_id}/duplicate", status_code=201, summary="Duplicate a template")
def duplicate_template(template_id: str):
    original = _get_or_404(template_id)

    now = datetime.utcnow()
    original.pop("_id")
    original["name"]       = f"{original['name']} (copy)"
    original["created_at"] = now
    original["updated_at"] = now

    result = templates_collection.insert_one(original)
    original["_id"] = result.inserted_id
    return _to_str_id(original)