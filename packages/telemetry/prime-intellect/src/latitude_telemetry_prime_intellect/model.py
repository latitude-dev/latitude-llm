from __future__ import annotations

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
    trace_id: str
    root: _Span
    closed: List[_Span] = field(default_factory=list)
    score_payloads: List[Dict[str, Any]] = field(default_factory=list)
