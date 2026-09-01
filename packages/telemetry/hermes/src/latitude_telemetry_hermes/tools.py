"""Tool definitions for `gen_ai.tool.definitions`.

The sanitized `request` payload carries the real toolset, but only while it is
under Hermes's 50 000-char hook payload ceiling — true early in a session,
false later. The in-process snapshot covers the rest.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .config import _debug
from .hermes import tool_definitions_snapshot
from .util import _safe_json

# Budget for the serialized array. Parameter sub-schemas are shed before whole
# tools, so the tool *names* always survive — that is what the Tools page needs.
_DEFINITIONS_MAX_CHARS = 96_000


def resolve_tool_definitions(kw: Dict[str, Any]) -> Optional[Tuple[List[Dict[str, Any]], str]]:
    """The definitions plus where they came from.

    The sanitized `request` is the per-call truth, but a toolset of any size
    blows past Hermes's 50 000-char hook payload ceiling, so in practice it is
    only ever available on a small conversation. The snapshot is the agent's
    equipped toolset — a superset of what a given call was offered once Hermes
    narrows dynamically — which is the right answer for "what is this agent
    equipped with" and is reported as such rather than silently.
    """
    definitions = _from_request(kw.get("request"))
    if definitions:
        return _fit(definitions), "request"
    snapshot = tool_definitions_snapshot()
    if snapshot:
        return _fit(snapshot), "snapshot"
    return None


def _from_request(request: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(request, dict) or request.get("_truncated"):
        return None
    body = request.get("body")
    tools = body.get("tools") if isinstance(body, dict) else request.get("tools")
    if not isinstance(tools, list) or not tools:
        return None
    return [t for t in tools if isinstance(t, dict)] or None


def _fit(definitions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if len(_safe_json(definitions)) <= _DEFINITIONS_MAX_CHARS:
        return definitions
    stripped = [_without_parameters(d) for d in definitions]
    if len(_safe_json(stripped)) <= _DEFINITIONS_MAX_CHARS:
        _debug(f"tool definitions over budget: dropped parameter schemas for {len(definitions)} tool(s)")
        return stripped
    kept: List[Dict[str, Any]] = []
    size = 2
    for definition in stripped:
        entry = len(_safe_json(definition)) + 1
        if size + entry > _DEFINITIONS_MAX_CHARS:
            break
        kept.append(definition)
        size += entry
    _debug(f"tool definitions over budget: exported {len(kept)} of {len(definitions)} tool(s)")
    return kept


def _without_parameters(definition: Dict[str, Any]) -> Dict[str, Any]:
    function = definition.get("function")
    if isinstance(function, dict):
        return {
            **{k: v for k, v in definition.items() if k != "function"},
            "function": {k: v for k, v in function.items() if k not in ("parameters", "input_schema", "inputSchema")},
        }
    return {k: v for k, v in definition.items() if k not in ("parameters", "input_schema", "inputSchema")}
