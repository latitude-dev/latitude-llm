"""Public export helpers for Verifiers → Latitude."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional

from .config import _config, _debug
from .mapper import map_trace
from .transport import _flush, _ship
from .util import _get

OnComplete = Callable[[Any], Awaitable[None]]


def export_trace(
    trace: Any,
    *,
    session_id: Optional[str] = None,
    env: Optional[str] = None,
    export_scores: Optional[bool] = None,
    flush: bool = False,
) -> Optional[str]:
    """Map one Verifiers Trace to OTLP, ship it, and optionally export scores.

    Returns the Latitude/OTLP trace id when export ran, else None (disabled / fail-open).
    """
    cfg = _config()
    if not cfg["enabled"]:
        _debug("export skipped: telemetry disabled or missing credentials")
        return None
    try:
        scores_enabled = cfg["export_scores"] if export_scores is None else export_scores
        otlp, scores = map_trace(
            trace,
            allow_content=cfg["allow_content"],
            export_scores=scores_enabled,
            session_id=session_id,
            env=env,
        )
        _ship(otlp, kind="traces")
        if scores:
            # Scores look up the target trace server-side; wait for OTLP delivery first.
            _flush()
            for score in scores:
                _ship(score, kind="score")
        if flush:
            _flush()
        spans = otlp["resourceSpans"][0]["scopeSpans"][0]["spans"]
        return spans[0]["traceId"] if spans else None
    except Exception as exc:
        _debug(f"export_trace failed: {exc}")
        return None


def export_episode(
    episode: Any,
    *,
    export_scores: Optional[bool] = None,
    flush: bool = False,
) -> List[str]:
    """Export every Trace on a Verifiers Episode."""
    env = _get(episode, "env") or ""
    session_id = _get(episode, "id")
    traces = list(_get(episode, "traces") or [])
    ids: List[str] = []
    for trace in traces:
        tid = export_trace(
            trace,
            session_id=session_id if isinstance(session_id, str) else None,
            env=env if isinstance(env, str) else None,
            export_scores=export_scores,
            flush=False,
        )
        if tid:
            ids.append(tid)
    if flush:
        _flush()
    return ids


def export_episodes(
    episodes: Iterable[Any],
    *,
    export_scores: Optional[bool] = None,
    flush: bool = True,
) -> List[str]:
    ids: List[str] = []
    for episode in episodes:
        ids.extend(export_episode(episode, export_scores=export_scores, flush=False))
    if flush:
        _flush()
    return ids


def make_on_complete(
    *,
    next: Optional[OnComplete] = None,
    export_scores: Optional[bool] = None,
) -> OnComplete:
    """Build an async ``on_complete`` callback for ``Env.run_slot``.

    Ships each finished episode to Latitude, then awaits ``next`` when provided
    so you can chain Verifiers' own persistence (``append_episode``).
    """

    async def on_complete(episode: Any) -> None:
        try:
            export_episode(episode, export_scores=export_scores, flush=True)
        except Exception as exc:
            _debug(f"on_complete export failed: {exc}")
        if next is not None:
            await next(episode)

    return on_complete


def export_results_dir(
    results_dir: str | Path,
    *,
    export_scores: Optional[bool] = None,
    flush: bool = True,
) -> List[str]:
    """Post-hoc export from a Verifiers results directory (``traces.jsonl`` / ``episodes``)."""
    root = Path(results_dir)
    ids: List[str] = []
    for path in _result_jsonl_paths(root):
        ids.extend(_export_jsonl(path, export_scores=export_scores))
    if flush:
        _flush()
    return ids


def _result_jsonl_paths(root: Path) -> List[Path]:
    if root.is_file() and root.suffix == ".jsonl":
        return [root]
    candidates = [
        root / "traces.jsonl",
        root / "episodes.jsonl",
        root / "results.jsonl",
    ]
    found = [p for p in candidates if p.is_file()]
    if found:
        return found
    return sorted(root.glob("*.jsonl"))


def _export_jsonl(path: Path, *, export_scores: Optional[bool]) -> List[str]:
    ids: List[str] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                _debug(f"{path}:{line_no} invalid JSON: {exc}")
                continue
            if not isinstance(row, dict):
                _debug(f"{path}:{line_no} expected a JSON object")
                continue
            if _looks_like_episode(row):
                ids.extend(export_episode(row, export_scores=export_scores, flush=False))
            else:
                tid = export_trace(row, export_scores=export_scores, flush=False)
                if tid:
                    ids.append(tid)
    return ids


def _looks_like_episode(row: Dict[str, Any]) -> bool:
    return isinstance(row.get("traces"), list) and ("env" in row or "ok" in row)
