from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


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


@dataclass
class _Run:
    trace_key: str
    trace_id: str
    root: _Span
    session_id: str
    task_id: str
    generations: Dict[str, _Span] = field(default_factory=dict)
    open_tools: Dict[str, _Span] = field(default_factory=dict)
    closed: List[_Span] = field(default_factory=list)
    system_prompt: Optional[str] = None
    llm_calls: int = 0
    updated_at: float = field(default_factory=time.time)
