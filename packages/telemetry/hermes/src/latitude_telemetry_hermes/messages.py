# ─────────────────────────── message normalization ─────────────────────────
# Hermes speaks the OpenAI chat shape; normalize into Latitude's GenAI parts.

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .util import _get, _safe_json

_ROLES = {"system", "user", "assistant", "tool"}


def _normalize_messages(raw: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not isinstance(raw, (list, tuple)):
        return out
    for m in raw:
        n = _normalize_message(m)
        if n:
            out.append(n)
    return out


def _normalize_message(m: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(m, dict):
        return None
    role = m.get("role")
    role = role if role in _ROLES else "user"
    if role == "tool":
        return {
            "role": "tool",
            "parts": [
                {
                    "type": "tool_call_response",
                    "id": m.get("tool_call_id") or "",
                    "response": _tool_result(m.get("content")),
                }
            ],
        }
    return _content_message(role, m.get("content"), m)


def _content_message(role: str, content: Any, envelope: Dict[str, Any]) -> Dict[str, Any]:
    parts: List[Dict[str, Any]] = []
    if isinstance(content, str):
        if content:
            parts.append({"type": "text", "content": content})
    elif isinstance(content, list):
        for block in content:
            p = _block(block)
            if p:
                parts.append(p)
    elif content is not None:
        parts.append({"type": "text", "content": _safe_json(content)})
    _append_tool_calls(parts, envelope.get("tool_calls"))
    if not parts:
        parts = [{"type": "text", "content": ""}]
    return {"role": role, "parts": parts}


def _normalize_assistant(obj: Any) -> Optional[Dict[str, Any]]:
    """Assistant output from post_llm_call (object or string)."""
    if obj is None:
        return None
    if isinstance(obj, str):
        return {"role": "assistant", "parts": [{"type": "text", "content": obj}]}
    parts: List[Dict[str, Any]] = []
    reasoning = _get(obj, "reasoning")
    if isinstance(reasoning, str) and reasoning:
        parts.append({"type": "reasoning", "content": reasoning})
    content = _get(obj, "content")
    if isinstance(content, str) and content:
        parts.append({"type": "text", "content": content})
    _append_tool_calls(parts, _get(obj, "tool_calls"))
    if not parts:
        parts = [{"type": "text", "content": ""}]
    return {"role": "assistant", "parts": parts}


def _block(block: Any) -> Optional[Dict[str, Any]]:
    if isinstance(block, str):
        return {"type": "text", "content": block}
    if not isinstance(block, dict):
        return None
    btype = block.get("type") or "text"
    if btype == "text":
        return {"type": "text", "content": block.get("content") or block.get("text") or ""}
    if btype in ("thinking", "reasoning"):
        return {"type": "reasoning", "content": block.get("thinking") or block.get("content") or ""}
    if btype == "tool_use":
        return {
            "type": "tool_call",
            "id": block.get("id") or "",
            "name": block.get("name") or "",
            "arguments": block.get("input") or {},
        }
    if btype == "tool_result":
        return {
            "type": "tool_call_response",
            "id": block.get("tool_use_id") or "",
            "response": block.get("content") or "",
        }
    return {"type": btype, "content": _safe_json(block)}


def _append_tool_calls(parts: List[Dict[str, Any]], raw: Any) -> None:
    if not isinstance(raw, (list, tuple)):
        return
    for tc in raw:
        fn = _get(tc, "function")
        name = _get(fn, "name") if fn is not None else _get(tc, "name")
        args = _get(fn, "arguments") if fn is not None else None
        if args is None:
            args = _get(tc, "arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                pass
        parts.append(
            {
                "type": "tool_call",
                "id": _get(tc, "id") or "",
                "name": name or "",
                "arguments": args if args is not None else {},
            }
        )


def _tool_result(raw: Any) -> Any:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list):
        texts = [b.get("text") if isinstance(b, dict) else b for b in raw]
        joined = "\n".join(t for t in texts if isinstance(t, str))
        return joined or raw
    return raw


def _system_prompt(messages: Any) -> Optional[str]:
    if not isinstance(messages, (list, tuple)):
        return None
    for m in messages:
        if isinstance(m, dict) and m.get("role") == "system":
            content = m.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                text = "\n".join(b.get("text", "") for b in content if isinstance(b, dict))
                if text:
                    return text
    return None


def _count_tool_calls(assistant: Any) -> int:
    tc = _get(assistant, "tool_calls")
    return len(tc) if isinstance(tc, (list, tuple)) else 0


def _has_content(assistant: Any, chars: int) -> bool:
    if isinstance(assistant, str):
        return bool(assistant.strip())
    content = _get(assistant, "content")
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        return len(content) > 0
    return (chars or 0) > 0
