"""Feature flags, "Coming soon" toggles and force-update version.
Read by anyone signed in; written by super-admins only."""
from fastapi import APIRouter, Depends

from .. import audit, store
from ..schemas import AiConfigBody, FeatureFlagsBody
from ..security import CurrentAdmin, get_current_admin, require_superadmin

router = APIRouter(prefix="/api/config", tags=["config"])
COL = "feature_flags"
DOC = "config"

DEFAULT_AI = {"geminiModel": "gemini-2.5-flash", "geminiFallbackModel": "gemini-2.5-flash-lite"}


@router.get("/flags")
def get_flags(admin: CurrentAdmin = Depends(get_current_admin)):
    doc = store.collection(COL).get(DOC)
    if not doc:
        return {
            "flags": {}, "comingSoon": {}, "forceUpdate": {"enabled": False},
            "appDiscount": {"platformExtraPct": 0, "enabled": False},
            "ai": dict(DEFAULT_AI)}
    doc.setdefault("ai", dict(DEFAULT_AI))
    return doc


@router.put("/flags")
def set_flags(body: FeatureFlagsBody, admin: CurrentAdmin = Depends(require_superadmin)):
    # Preserve the AI config (edited on its own endpoint) so a flags save can't wipe it.
    existing = store.collection(COL).get(DOC) or {}
    rec = store.collection(COL).set(DOC, {
        "flags": body.flags, "comingSoon": body.comingSoon,
        "forceUpdate": body.forceUpdate, "appDiscount": body.appDiscount,
        "ai": existing.get("ai", dict(DEFAULT_AI)),
        "updatedAtMillis": store.now_ms(),
        "updatedBy": admin.email,
    })
    audit.log(admin, "config.flags.update", DOC)
    return rec


@router.put("/ai")
def set_ai(body: AiConfigBody, admin: CurrentAdmin = Depends(require_superadmin)):
    """Update just the AI model names the app reads at runtime. Merges into the
    config doc so feature flags are untouched."""
    rec = store.collection(COL).update(DOC, {
        "ai": body.model_dump(),
        "updatedAtMillis": store.now_ms(),
        "updatedBy": admin.email,
    })
    audit.log(admin, "config.ai.update", DOC)
    return rec
