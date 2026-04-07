#!/usr/bin/env python3
"""
scripts/seed_templates.py
─────────────────────────
Reads every template_*.json file from a templates folder and upserts them
into MongoDB.

Usage:
    python scripts/seed_templates.py
    python scripts/seed_templates.py --folder /custom/path --drop

Flags:
    --folder  PATH   Directory containing template JSON files (default: news_overlay_templates/)
    --drop           Drop all existing templates before seeding (clean slate)
    --dry-run        Print what would be inserted without touching the database
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient, UpdateOne
from pymongo.errors import BulkWriteError

# ── Config ───────────────────────────────────────────────────────────────────
import os
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "livewire")
COLL_NAME = "templates"

SCRIPT_DIR   = Path(__file__).parent
DEFAULT_FOLDER = SCRIPT_DIR.parent / "news_overlay_templates"


def load_template_files(folder: Path) -> list[dict]:
    """Load and validate all template_*.json files in the folder."""
    files = sorted(folder.glob("template_*.json"))
    if not files:
        print(f"⚠️  No template_*.json files found in {folder}")
        return []

    templates = []
    for fp in files:
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"  ✗ Skipping {fp.name} — JSON error: {e}")
            continue

        # Validate required top-level keys
        required = {"name", "config"}
        missing = required - data.keys()
        if missing:
            print(f"  ✗ Skipping {fp.name} — missing keys: {missing}")
            continue

        templates.append({"file": fp.name, "data": data})
        print(f"  ✔ Loaded {fp.name}  →  \"{data['name']}\"")

    return templates


def seed(folder: Path, drop: bool = False, dry_run: bool = False) -> None:
    now = datetime.now(tz=timezone.utc)

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Loading templates from: {folder}\n")
    templates = load_template_files(folder)

    if not templates:
        print("Nothing to seed.")
        return

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(templates)} template(s) — no DB writes performed.")
        return

    # ── Connect ──────────────────────────────────────────────────────────────
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5_000)
    try:
        client.admin.command("ping")
    except Exception as e:
        print(f"\n✗ Cannot connect to MongoDB ({MONGO_URI}): {e}")
        sys.exit(1)

    db   = client[DB_NAME]
    coll = db[COLL_NAME]

    if drop:
        deleted = coll.delete_many({}).deleted_count
        print(f"\n🗑  Dropped {deleted} existing template(s) from '{COLL_NAME}'.")

    # ── Upsert operations ────────────────────────────────────────────────────
    ops = []
    for item in templates:
        data = item["data"]
        doc = {
            "name":       data["name"],
            "config":     data["config"],
            "tags":       data.get("tags", []),
            "updated_at": now,
        }
        ops.append(
            UpdateOne(
                {"name": data["name"]},          # match by name
                {
                    "$set": doc,
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )
        )

    try:
        result = coll.bulk_write(ops, ordered=False)
    except BulkWriteError as bwe:
        print(f"\n✗ Bulk write error: {bwe.details}")
        sys.exit(1)

    print(f"\n✅ Seed complete:")
    print(f"   Inserted : {result.upserted_count}")
    print(f"   Updated  : {result.modified_count}")
    print(f"   Matched  : {result.matched_count}")
    print(f"   Database : {DB_NAME}.{COLL_NAME}")
    client.close()


def main():
    parser = argparse.ArgumentParser(description="Seed news overlay templates into MongoDB.")
    parser.add_argument(
        "--folder", type=Path, default=DEFAULT_FOLDER,
        help=f"Folder containing template_*.json files (default: {DEFAULT_FOLDER})"
    )
    parser.add_argument(
        "--drop", action="store_true",
        help="Drop all existing templates before seeding"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be inserted without touching the database"
    )
    args = parser.parse_args()

    folder = args.folder.resolve()
    if not folder.is_dir():
        print(f"✗ Folder not found: {folder}")
        sys.exit(1)

    seed(folder=folder, drop=args.drop, dry_run=args.dry_run)


if __name__ == "__main__":
    main()