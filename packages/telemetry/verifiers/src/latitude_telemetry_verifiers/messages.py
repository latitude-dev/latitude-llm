"""Normalize Verifiers / OpenAI-shaped messages into Latitude GenAI parts."""

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
    if m is None:
        return None
    if isinstance(m, dict):
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
        return _content_message(role, m.get("content"), m, m.get("reasoning_content"))

    role = _get(m, "role")
    role = role if role in _ROLES else "user"
    if role == "tool":
        return {
            "role": "tool",
            "parts": [
                {
                    "type": "tool_call_response",
                    "id": _get(m, "tool_call_id") or "",
                    "response": _tool_result(_get(m, "content")),
                }
            ],
        }
    envelope = {
        "tool_calls": _get(m, "tool_calls"),
    }
    return _content_message(role, _get(m, "content"), envelope, _get(m, "reasoning_content"))


def _content_message(
    role: str,
    content: Any,
    envelope: Dict[str, Any],
    reasoning: Any = None,
) -> Optional[Dict[str, Any]]:
    parts: List[Dict[str, Any]] = []
    if isinstance(reasoning, str) and reasoning.strip():
        parts.append({"type": "reasoning", "content": reasoning})
    if isinstance(content, str):
        if content.strip():
            parts.append({"type": "text", "content": content})
    elif isinstance(content, list):
        for block in content:
            p = _block(block)
            if p:
                parts.append(p)
    elif content is not None:
        parts.append({"type": "text", "content": _safe_json(content)})
    _append_tool_calls(parts, envelope.get("tool_calls") if isinstance(envelope, dict) else None)
    if not parts:
        return None
    return {"role": role, "parts": parts}


def _block(block: Any) -> Optional[Dict[str, Any]]:
    if isinstance(block, str):
        if not block.strip():
            return None
        return {"type": "text", "content": block}
    if not isinstance(block, dict):
        return None
    btype = block.get("type") or "text"
    if btype == "text":
        text = block.get("content") or block.get("text") or ""
        if not isinstance(text, str) or not text.strip():
            return None
        return {"type": "text", "content": text}
    if btype in ("thinking", "reasoning"):
        text = block.get("thinking") or block.get("content") or ""
        if not isinstance(text, str) or not text.strip():
            return None
        return {"type": "reasoning", "content": text}
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


def _message_role(m: Any) -> str:
    role = _get(m, "role") if not isinstance(m, dict) else m.get("role")
    return role if isinstance(role, str) else ""


def _system_prompt_from_messages(messages: Any) -> Optional[str]:
    if not isinstance(messages, (list, tuple)):
        return None
    for m in messages:
        if _message_role(m) != "system":
            continue
        content = _get(m, "content") if not isinstance(m, dict) else m.get("content")
        if isinstance(content, str) and content.strip():
            return content
    return None


def _first_user_text(messages: Any) -> Optional[str]:
    if not isinstance(messages, (list, tuple)):
        return None
    for m in messages:
        if _message_role(m) != "user":
            continue
        content = _get(m, "content") if not isinstance(m, dict) else m.get("content")
        if isinstance(content, str) and content.strip():
            return content
    return None
