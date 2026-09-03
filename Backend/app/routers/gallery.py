"""Image gallery / carousel shown on the public marketing website.

The Super Admin uploads a set of images (each a hosted URL, or an upload
stored as a data URI) with an optional caption and click-through link. The
marketing website fetches ``GET /api/gallery`` on load — that route is
intentionally PUBLIC (no admin login) because anonymous visitors need to see
it — and renders the active images as an auto-scrolling carousel with
prev/next arrows, below the live demo.

``GET /api/gallery/admin``, ``POST /api/gallery``, ``PUT /api/gallery/{id}``
and ``DELETE /api/gallery/{id}`` are Super-Admin only, matching the
poster.py / coverage.py pattern used elsewhere in this API.

Large uploads & Firestore's 1 MB/document limit
------------------------------------------------
An uploaded image arrives as a base64 data URI. A 2 MB image is ~2.7 MB of
base64 — well over Firestore's 1 MiB per-document cap — so we don't store the
image on the gallery document itself. Instead the base64 is split into
``CHUNK_SIZE``-sized pieces, each saved as its own document in the
``gallery_chunks`` collection (``{item_id}:{index}``), and stitched back
together on read. Hosted URLs (not data URIs) are small, so they stay inline
on the document and create no chunks. This is transparent to the frontend:
every endpoint still returns/accepts a single ``imageUrl`` string.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import audit, store
from ..security import CurrentAdmin, require_superadmin

router = APIRouter(prefix="/api/gallery", tags=["gallery"])
COL = "gallery"
CHUNK_COL = "gallery_chunks"

# Safely under Firestore's 1,048,576-byte document limit, leaving headroom for
# the other fields on a chunk document.
CHUNK_SIZE = 900_000


class GalleryItemIn(BaseModel):
    imageUrl: str
    title: str = ""
    linkUrl: str = ""
    active: bool = True
    order: int = 0


# ── chunked-image storage helpers ────────────────────────────────────────────
def _clear_chunks(item_id: str) -> None:
    """Delete every stored chunk belonging to an image."""
    for chunk in store.collection(CHUNK_COL).list(where={"parent": item_id}):
        store.collection(CHUNK_COL).delete(chunk["id"])


def _save_image(item_id: str, image_url: str) -> dict:
    """Persist an image for `item_id`, splitting big ones across chunk docs.

    Returns the fields to store on the gallery document itself: a short image
    stays inline; a long one is blanked out and its byte-count of chunks is
    recorded so `_load_image` knows to reassemble.
    """
    _clear_chunks(item_id)
    if len(image_url) <= CHUNK_SIZE:
        return {"imageUrl": image_url, "chunkCount": 0}

    pieces = [image_url[i:i + CHUNK_SIZE] for i in range(0, len(image_url), CHUNK_SIZE)]
    for index, piece in enumerate(pieces):
        store.collection(CHUNK_COL).set(f"{item_id}:{index}", {
            "parent": item_id,
            "index": index,
            "data": piece,
        })
    return {"imageUrl": "", "chunkCount": len(pieces)}


def _load_image(row: dict) -> str:
    """Reassemble an image from its chunks, or return the inline URL as-is."""
    count = row.get("chunkCount", 0) or 0
    if count <= 0:
        return row.get("imageUrl", "")
    chunks = store.collection(CHUNK_COL).list(where={"parent": row["id"]})
    chunks.sort(key=lambda c: c.get("index", 0))
    return "".join(c.get("data", "") for c in chunks)


def _to_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "imageUrl": _load_image(row),
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


# ── endpoints ────────────────────────────────────────────────────────────────
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
        "imageUrl": "",
        "chunkCount": 0,
        "title": body.title,
        "linkUrl": body.linkUrl,
        "active": body.active,
        "order": body.order,
        "createdAtMillis": store.now_ms(),
        "updatedBy": admin.email,
    })
    row = store.collection(COL).update(row["id"], _save_image(row["id"], body.imageUrl))
    audit.log(admin, "gallery.add", row["id"], {"title": body.title})
    return _to_out(row)


@router.put("/{item_id}")
def update_item(item_id: str, body: GalleryItemIn,
                admin: CurrentAdmin = Depends(require_superadmin)):
    existing = store.collection(COL).get(item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Image not found.")
    fields = {
        "title": body.title,
        "linkUrl": body.linkUrl,
        "active": body.active,
        "order": body.order,
        "updatedAtMillis": store.now_ms(),
        "updatedBy": admin.email,
        **_save_image(item_id, body.imageUrl),
    }
    row = store.collection(COL).update(item_id, fields)
    audit.log(admin, "gallery.update", item_id, {"active": body.active})
    return _to_out(row)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, admin: CurrentAdmin = Depends(require_superadmin)):
    _clear_chunks(item_id)
    store.collection(COL).delete(item_id)
    audit.log(admin, "gallery.delete", item_id, {})
