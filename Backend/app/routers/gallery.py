"""Image gallery / carousel shown on the public marketing website.

The Super Admin uploads a set of images (each a hosted URL, or a small upload
stored as a data URI) with an optional caption and click-through link. The
marketing website fetches ``GET /api/gallery`` on load — that route is
intentionally PUBLIC (no admin login) because anonymous visitors need to see
it — and renders the active images as an auto-scrolling carousel with
prev/next arrows, below the live demo.

``GET /api/gallery/admin``, ``POST /api/gallery``, ``PUT /api/gallery/{id}``
and ``DELETE /api/gallery/{id}`` are Super-Admin only, matching the
poster.py / coverage.py pattern used elsewhere in this API.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import audit, store
from ..security import CurrentAdmin, require_superadmin

router = APIRouter(prefix="/api/gallery", tags=["gallery"])
COL = "gallery"


class GalleryItemIn(BaseModel):
    imageUrl: str
    title: str = ""
    linkUrl: str = ""
    active: bool = True
    order: int = 0


def _to_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "imageUrl": row.get("imageUrl", ""),
        "title": row.get("title", ""),
        "linkUrl": row.get("linkUrl", ""),
        "active": row.get("active", True),
        "order": row.get("order", 0),
        "createdAtMillis": row.get("createdAtMillis", 0),
        "updatedBy": row.get("updatedBy", ""),
    }


def _sorted(rows: list) -> list:
    # Lowest `order` first, then oldest first — a stable, predictable sequence
    # for the carousel.
    return sorted(rows, key=lambda r: (r.get("order", 0), r.get("createdAtMillis", 0)))


@router.get("")
def list_public():
    """Public — polled by the marketing website. Only active images, ordered."""
    rows = store.collection(COL).list(where={"active": True})
    return {"images": [_to_out(r) for r in _sorted(rows)]}


@router.get("/admin")
def list_admin(admin: CurrentAdmin = Depends(require_superadmin)):
    """Every image (even hidden ones) for the Super Admin gallery page."""
    rows = store.collection(COL).list()
    return {"images": [_to_out(r) for r in _sorted(rows)]}


@router.post("", status_code=201)
def add_item(body: GalleryItemIn, admin: CurrentAdmin = Depends(require_superadmin)):
    if not body.imageUrl:
        raise HTTPException(status_code=400, detail="An image is required.")
    row = store.collection(COL).add({
        "imageUrl": body.imageUrl,
        "title": body.title,
        "linkUrl": body.linkUrl,
        "active": body.active,
        "order": body.order,
        "createdAtMillis": store.now_ms(),
        "updatedBy": admin.email,
    })
    audit.log(admin, "gallery.add", row["id"], {"title": body.title})
    return _to_out(row)


@router.put("/{item_id}")
def update_item(item_id: str, body: GalleryItemIn,
                admin: CurrentAdmin = Depends(require_superadmin)):
    existing = store.collection(COL).get(item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Image not found.")
    row = store.collection(COL).update(item_id, {
        "imageUrl": body.imageUrl,
        "title": body.title,
        "linkUrl": body.linkUrl,
        "active": body.active,
        "order": body.order,
        "updatedAtMillis": store.now_ms(),
        "updatedBy": admin.email,
    })
    audit.log(admin, "gallery.update", item_id, {"active": body.active})
    return _to_out(row)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, admin: CurrentAdmin = Depends(require_superadmin)):
    store.collection(COL).delete(item_id)
    audit.log(admin, "gallery.delete", item_id, {})
