"""Memory telemetry for Hermes's two built-in stores.

One store per profile, one record per store file, and the record body is the
whole file: that is the granularity Latitude's ledger is built for, so per-line
diffs and per-entry blame come out of a full body per mutating span. Per-entry
records were rejected — `replace`/`remove` address entries by an `old_text`
substring, so a stable per-entry record id is not derivable.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from .config import MEMORY_RECORDS_CAP, _config, _debug
from .hermes import external_memory_provider, memory_dir

# tools/memory_tool.py:78 — inlined rather than imported so a guarded import
# failure cannot take memory telemetry down with it.
_ENTRY_DELIMITER = "\n§\n"

_RECORDS = {"memory": "MEMORY.md", "user": "USER.md"}
_USAGE_LIMIT = re.compile(r"/\s*([\d,]+)\s*chars")

ReadFile = Callable[[Path], Optional[str]]


def store_id() -> str:
    """`hermes/` prefixed so it stays distinct from a claude-code store in a
    project that receives both."""
    return f"hermes/{_config().get('profile') or 'default'}"


def enabled() -> bool:
    if not _config().get("memory"):
        return False
    provider = external_memory_provider()
    if provider:
        _debug(f"memory telemetry off: external provider {provider!r} is the live store")
        return False
    return True


def capture_bodies() -> bool:
    return bool(_config().get("memory_content") and _config().get("allow_content"))


def _default_read_file(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return None


def record_paths() -> Dict[str, Path]:
    directory = memory_dir()
    return {filename: directory / filename for filename in _RECORDS.values()}


def read_snapshot(record_id: str, read_file: Optional[ReadFile] = None) -> Optional[Tuple[str, int, int]]:
    """`(body, entry_count, chars)` for a store file, or None when unreadable/empty."""
    path = memory_dir() / record_id
    body = (read_file or _default_read_file)(path)
    if not body or not body.strip():
        return None
    return body, entry_count(body), len(body)


def entry_count(body: str) -> int:
    if not body or not body.strip():
        return 0
    return len([entry for entry in body.split(_ENTRY_DELIMITER) if entry.strip()])


def session_reads(read_file: Optional[ReadFile] = None) -> List[Dict[str, Any]]:
    """The frozen snapshot Hermes injects into the system prompt at session
    start: one read per non-empty store, once per session."""
    out: List[Dict[str, Any]] = []
    for record_id in _RECORDS.values():
        snapshot = read_snapshot(record_id, read_file)
        if snapshot is None:
            continue
        body, entries, chars = snapshot
        out.append(
            {
                "operation": "search_memory",
                "record_id": record_id,
                "body": body,
                "entry_count": entries,
                "chars": chars,
                "action": "read",
            }
        )
    return out


def classify_write(args: Any, result: Any, read_file: Optional[ReadFile] = None) -> Optional[Dict[str, Any]]:
    """Recover the post-state of a successful `memory` tool call.

    The tool's success response deliberately omits the entry list, so the new
    body has to come off disk — the write has already landed under the tool's
    own file lock.
    """
    if not isinstance(args, dict):
        return None
    record_id = _RECORDS.get(str(args.get("target") or "memory").strip().lower())
    if record_id is None:
        return None

    operations = args.get("operations")
    action = "batch" if isinstance(operations, (list, tuple)) and operations else str(args.get("action") or "add")

    snapshot = read_snapshot(record_id, read_file)
    body, entries, chars = snapshot if snapshot else ("", 0, 0)
    op = {
        "operation": "delete_memory" if not body else "upsert_memory",
        "record_id": record_id,
        "body": body,
        "entry_count": entries,
        "chars": chars,
        "action": action,
        "limit": _limit_from_result(result),
    }
    reported = _reported_entry_count(result)
    # A disagreement means a sister session wrote between the tool's flush and
    # our read: keep the span, drop a body we cannot vouch for.
    if reported is not None and reported != entries:
        _debug(f"memory entry count mismatch for {record_id}: {reported} reported, {entries} on disk")
        op["body"] = ""
        op["stale"] = True
    return op


def records_attribute(record_id: str, body: str) -> List[Dict[str, Any]]:
    return [{"id": record_id, "content": body[:MEMORY_RECORDS_CAP]}]


def _reported_entry_count(result: Any) -> Optional[int]:
    payload = _as_dict(result)
    value = payload.get("entry_count") if payload else None
    return value if isinstance(value, int) else None


def _limit_from_result(result: Any) -> Optional[int]:
    payload = _as_dict(result)
    usage = payload.get("usage") if payload else None
    if not isinstance(usage, str):
        return None
    match = _USAGE_LIMIT.search(usage)
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _as_dict(result: Any) -> Optional[Dict[str, Any]]:
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        try:
            import json

            parsed = json.loads(result)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def write_succeeded(result: Any) -> bool:
    payload = _as_dict(result)
    if payload is None:
        return True
    if payload.get("error"):
        return False
    success = payload.get("success")
    return success is not False
