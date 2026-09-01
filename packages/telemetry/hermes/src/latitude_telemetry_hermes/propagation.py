"""W3C Trace Context in and out.

In: a harness that launched this Hermes process can hand it an active span through
`traceparent`, and the turn joins that trace instead of rooting its own.

Out: when Hermes runs a tool that spawns a child harness (Claude Code, Codex, a
remote agent), the child needs the tool span to attach under. The plugin never
spawns anything itself, so it publishes the active context two ways: `child_env()`
for a tool that wires it explicitly, and — behind an opt-in flag — a scoped mutation
of `os.environ` around the tool call, which every subprocess inherits for free.

The contract is harness-agnostic: a valid traceparent means "you are a child of this
span", its absence means "you are a root".
"""

from __future__ import annotations

import os
import re
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Dict, Mapping, Optional, Tuple

# Matched with `fullmatch`: `$` also matches before a trailing newline, so a field
# ending in one would otherwise pass.
_TRACE_ID_RE = re.compile(r"[0-9a-f]{32}")
_SPAN_ID_RE = re.compile(r"[0-9a-f]{16}")
_VERSION_RE = re.compile(r"[0-9a-f]{2}")
_FLAGS_RE = re.compile(r"[0-9a-f]{2}")

TRACEPARENT_VAR = "TRACEPARENT"
LATITUDE_TRACEPARENT_VAR = "LATITUDE_TRACEPARENT"
SESSION_VAR = "LATITUDE_SESSION_ID"
PROJECT_VAR = "LATITUDE_PROJECT"

# How many turns one process may contribute to a trace it does not own. Latitude
# reloads the whole trace on every late span, so an unbounded join would make a
# long-lived process re-read an ever-growing trace. Past this, turns root their own
# traces and stay grouped by the shared session id alone.
MAX_INHERITED_TURNS = 200

# The turn-local traceparent a child process should attach under, set for the
# duration of a tool call. A ContextVar rather than a plain global because Hermes
# runs each turn on its own worker thread, so a global would leak one turn's tool
# span into another's child processes.
_ACTIVE: ContextVar[Optional[ChildContext]] = ContextVar("latitude_active_child_context", default=None)


@dataclass(frozen=True)
class ChildContext:
    traceparent: str
    session_id: str
    project: str


@dataclass(frozen=True)
class InheritedContext:
    trace_id: str
    parent_span_id: str
    session_id: str


def parse_traceparent(raw: Optional[str]) -> Optional[Tuple[str, str]]:
    value = (raw or "").strip().lower()
    if not value:
        return None
    parts = value.split("-")
    if len(parts) < 4:
        return None
    version, trace_id, span_id, flags = parts[0], parts[1], parts[2], parts[3]
    if not _VERSION_RE.fullmatch(version) or version == "ff":
        return None
    # Version 00 is exactly four fields; a later version may append more, which this
    # version must ignore rather than reject (W3C forward-compatibility rule).
    if version == "00" and len(parts) != 4:
        return None
    if not _TRACE_ID_RE.fullmatch(trace_id) or not _SPAN_ID_RE.fullmatch(span_id):
        return None
    if not _FLAGS_RE.fullmatch(flags):
        return None
    if trace_id == "0" * 32 or span_id == "0" * 16:
        return None
    return trace_id, span_id


def format_traceparent(trace_id: str, span_id: str, sampled: bool = True) -> str:
    return f"00-{trace_id}-{span_id}-{'01' if sampled else '00'}"


def inherited_traceparent(env: Optional[Mapping[str, str]] = None) -> Optional[str]:
    """The header this process was launched with, by variable precedence.

    Presence, not truthiness: setting the scoped variable to an empty value opts this
    harness out of an unrelated `TRACEPARENT` the environment already carries.
    """
    source = os.environ if env is None else env
    # The Latitude-scoped name wins so a pipeline that already sets `TRACEPARENT` for
    # something unrelated can opt this harness in (or out) without disturbing it.
    for name in (LATITUDE_TRACEPARENT_VAR, TRACEPARENT_VAR, "traceparent"):
        if name in source:
            return source[name]
    return None


def inherited_session_id(env: Optional[Mapping[str, str]] = None) -> str:
    """The session id a parent handed us, read independently of trace joining: past
    the join ceiling turns root their own traces but stay grouped by this id."""
    source = os.environ if env is None else env
    return (source.get(SESSION_VAR) or "").strip()


def inherited_context(env: Optional[Mapping[str, str]] = None) -> Optional[InheritedContext]:
    """The span this process was launched under, if any."""
    parsed = parse_traceparent(inherited_traceparent(env))
    if parsed is None:
        return None
    return InheritedContext(
        trace_id=parsed[0],
        parent_span_id=parsed[1],
        session_id=inherited_session_id(env),
    )


def set_active(context: Optional[ChildContext]) -> None:
    _ACTIVE.set(context)


def current_traceparent() -> Optional[str]:
    """The traceparent a subprocess launched right now should attach under."""
    active = _ACTIVE.get()
    return active.traceparent if active else None


def child_env(base: Optional[Mapping[str, str]] = None) -> Dict[str, str]:
    """Environment for a child harness, carrying trace, session and project routing.

    Project routing is not optional decoration: ingest is project-scoped, so a child
    that ships to a different project splits the trace in two with no error anywhere.
    """
    out: Dict[str, str] = dict(os.environ if base is None else base)
    active = _ACTIVE.get()
    if active is None:
        return out
    # Both names, because reads prefer the scoped one: publishing only `TRACEPARENT`
    # would let a scoped header this process inherited outrank the span we just opened,
    # attaching the child to our own parent instead of to us.
    out[TRACEPARENT_VAR] = active.traceparent
    out[LATITUDE_TRACEPARENT_VAR] = active.traceparent
    if active.session_id:
        out[SESSION_VAR] = active.session_id
    if active.project:
        out[PROJECT_VAR] = active.project
    return out
