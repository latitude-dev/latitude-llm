"""Per-session tags and metadata.

Built once per session and frozen; per-turn fields merge on top at span build
time. Tags are the only user-controlled *breakdown* dimension Latitude accepts
for traces and sessions, and a session filter — so they are what makes "compare
these two agent versions" a one-query pivot and a two-variant experiment.
Metadata is the filter-only, higher-cardinality half.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Tuple

from .config import (
    MAX_METADATA_KEYS,
    MAX_METADATA_VALUE_CHARS,
    MAX_TAG_CHARS,
    MAX_TAGS,
    PKG_VERSION,
    _debug,
)
from .hermes import hermes_version

# Hermes's cron surface names its sessions `cron_<job id>_<YYYYmmdd_HHMMSS>`
# (cron/scheduler.py). The tag is absent if that format ever changes.
_CRON_SESSION = re.compile(r"^cron_(?P<job>.+)_\d{8}_\d{6}$")


@dataclass(frozen=True)
class SessionContext:
    tags: Tuple[str, ...]
    metadata: Mapping[str, str]
    agent_name: str
    service_name: str


def build_session_context(kw: Mapping[str, Any], cfg: Mapping[str, Any], session_id: str) -> SessionContext:
    profile = str(cfg.get("profile") or "default")
    agent_name = str(cfg.get("agent_name") or "") or (profile if profile != "default" else "")
    agent_version = str(cfg.get("agent_version") or "")
    platform = str(kw.get("platform") or "").strip() or "cli"
    cron_job = _cron_job_id(session_id)

    tags: List[str] = ["hermes", platform]
    if agent_name:
        tags.append(agent_name)
    if agent_version:
        tags.append(agent_version)
    if cron_job:
        tags.append(f"cron:{cron_job}")
    tags.extend(cfg.get("tags") or [])

    derived: Dict[str, Any] = {
        "hermes.session.id": session_id,
        "hermes.platform": platform,
        "hermes.profile": profile,
        "hermes.version": hermes_version(),
        "hermes.plugin.version": PKG_VERSION,
        "hermes.agent.name": agent_name or None,
        "hermes.agent.version": agent_version or None,
        "hermes.cron.job.id": cron_job,
    }

    return SessionContext(
        tags=_sanitize_tags(tags),
        metadata=_sanitize_metadata(derived, _user_metadata(cfg)),
        agent_name=agent_name,
        service_name=str(cfg.get("service_name") or "hermes-agent"),
    )


def _cron_job_id(session_id: str) -> Optional[str]:
    match = _CRON_SESSION.match(session_id or "")
    return match.group("job") if match else None


def _user_metadata(cfg: Mapping[str, Any]) -> Dict[str, Any]:
    """User keys stay verbatim so `metadata.deployment` works as a filter key;
    a `hermes.`-prefixed one is dropped rather than shadowing a derived key."""
    out: Dict[str, Any] = {}
    for key, value in (cfg.get("metadata") or {}).items():
        name = str(key).strip()
        if not name:
            continue
        if name.startswith("hermes."):
            _debug(f"dropping user metadata key {name!r}: the hermes.* namespace is reserved")
            continue
        out[name] = value
    return out


def _sanitize_tags(raw: List[str]) -> Tuple[str, ...]:
    out: List[str] = []
    seen = set()
    dropped = 0
    for tag in raw:
        text = str(tag).strip()
        if not text or text in seen:
            continue
        if len(text) > MAX_TAG_CHARS:
            dropped += 1
            continue
        if len(out) >= MAX_TAGS:
            dropped += 1
            continue
        seen.add(text)
        out.append(text)
    if dropped:
        _debug(f"dropped {dropped} tag(s) over the {MAX_TAGS}-tag / {MAX_TAG_CHARS}-char limit")
    return tuple(out)


def _sanitize_metadata(derived: Mapping[str, Any], user: Mapping[str, Any]) -> Mapping[str, str]:
    """Derived keys are placed first so the key cap can only ever evict a user's.

    Filling from the user's map first would let a 64-key config push out
    `hermes.session.id` and every other derived key — the same harm as an
    overwrite, reached by eviction instead.
    """
    out: Dict[str, str] = {}
    dropped = 0
    for source in (derived, user):
        for key, value in source.items():
            if value is None or value == "" or str(key) in out:
                continue
            text = value if isinstance(value, str) else _stringify(value)
            if len(text) > MAX_METADATA_VALUE_CHARS or len(out) >= MAX_METADATA_KEYS:
                dropped += 1
                continue
            out[str(key)] = text
    if dropped:
        _debug(f"dropped {dropped} metadata entr(ies) over the {MAX_METADATA_KEYS}-key / value-length limit")
    return out


def _stringify(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    try:
        import json

        return json.dumps(value, default=str)
    except Exception:
        return str(value)
