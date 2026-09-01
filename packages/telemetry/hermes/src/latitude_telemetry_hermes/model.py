from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .context import SessionContext


@dataclass
class _Span:
    trace_id: str
    span_id: str
    parent_span_id: str
    name: str
    start_ms: int
    end_ms: Optional[int] = None
    attrs: Dict[str, Any] = field(default_factory=dict)
    outcome: str = "ok"
    error_message: Optional[str] = None
    kind: int = 1


@dataclass
class _StreamWatch:
    started_ms: Optional[int] = None
    first_delta_ms: Optional[int] = None
    error: Optional[str] = None
    updated_at: float = field(default_factory=time.time)


@dataclass
class _Subagent:
    parent_session_id: str
    parent_turn_id: str
    child_role: str
    child_subagent_id: str
    child_goal: str
    trace_id: str
    parent_span_id: str
    created_at: float = field(default_factory=time.time)


@dataclass
class _Session:
    """Per-session state that outlives a single turn."""

    session_id: str
    context: Optional[SessionContext] = None
    sender_id: str = ""
    parent_session_id: str = ""
    memory_read_done: bool = False
    tool_definitions: Optional[List[Dict[str, Any]]] = None
    tool_definitions_source: str = ""
    aux_emitted: bool = False
    exported: Dict[str, int] = field(default_factory=dict)
    child_sessions: List[str] = field(default_factory=list)
    updated_at: float = field(default_factory=time.time)


@dataclass
class _Run:
    trace_key: str
    trace_id: str
    root: _Span
    session: _Session
    session_id: str
    reported_session_id: str
    task_id: str
    turn_id: str = ""
    generations: Dict[str, _Span] = field(default_factory=dict)
    open_tools: Dict[str, _Span] = field(default_factory=dict)
    extra_tags: List[str] = field(default_factory=list)
    extra_metadata: Dict[str, Any] = field(default_factory=dict)
    subagent: Optional[_Subagent] = None
    thread_name: str = ""
    is_background: bool = False
    llm_calls: int = 0
    tool_calls: int = 0
    llm_calls_unreported: int = 0
    unknown_items: int = 0
    system_prompt: Optional[str] = None
    last_output: Optional[Dict[str, Any]] = None
    updated_at: float = field(default_factory=time.time)
