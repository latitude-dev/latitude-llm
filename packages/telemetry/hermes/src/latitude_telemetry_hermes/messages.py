# ─────────────────────────── message normalization ─────────────────────────
# Three dialects reach the hooks — Responses/Codex items, Chat Completions
# messages and Anthropic content blocks — and one replayed history can mix
# them. Dispatch per item on its own shape: Responses tool and reasoning items
# carry no `role` at all, so a role-first reading drops them.

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from .util import _get, _safe_json

_ROLES = {"system", "user", "assistant", "tool"}
_ROLE_ALIASES = {"developer": "system"}

# Latitude's part vocabulary (rosetta-ai `GenAIPart`). A part outside this set
# reaches storage and renders through the UI's unknown-part fallback.
_TEXT_BLOCKS = {"text", "input_text", "output_text", "summary_text"}
_REASONING_BLOCKS = {"thinking", "reasoning"}
_IMAGE_BLOCKS = {"image", "input_image", "output_image"}


def _normalize_messages(raw: Any) -> List[Dict[str, Any]]:
    return normalize_messages(raw)[0]


def normalize_messages(raw: Any) -> Tuple[List[Dict[str, Any]], int]:
    """Normalize a replayed history; returns the messages and the unknown-item count."""
    acc = _Accumulator()
    if isinstance(raw, (list, tuple)):
        for item in raw:
            _consume(item, acc)
    return acc.messages, acc.unknown


class _Accumulator:
    def __init__(self) -> None:
        self.messages: List[Dict[str, Any]] = []
        self.unknown = 0

    def add(self, role: str, parts: List[Dict[str, Any]]) -> None:
        if not parts:
            return
        self.messages.append({"role": role, "parts": parts})

    def add_assistant(self, parts: List[Dict[str, Any]]) -> None:
        """Attach to the trailing assistant message so a reasoning/text/tool_call
        run reads as one turn, the way the transcript shows it."""
        if not parts:
            return
        if self.messages and self.messages[-1]["role"] == "assistant":
            self.messages[-1]["parts"].extend(parts)
            return
        self.messages.append({"role": "assistant", "parts": parts})


def _consume(item: Any, acc: _Accumulator) -> None:
    if isinstance(item, str):
        if item.strip():
            acc.add("user", [{"type": "text", "content": item}])
        return
    if not isinstance(item, dict):
        return

    itype = item.get("type")
    if itype in ("function_call", "custom_tool_call"):
        acc.add_assistant([_responses_tool_call(item)])
        return
    if itype in ("function_call_output", "custom_tool_call_output"):
        acc.add(
            "tool",
            [
                {
                    "type": "tool_call_response",
                    "id": item.get("call_id") or item.get("id") or "",
                    "response": _tool_result(item.get("output")),
                }
            ],
        )
        return
    if itype == "reasoning":
        summary = _reasoning_summary(item)
        if summary:
            acc.add_assistant([{"type": "reasoning", "content": summary}])
        return
    if itype == "message" or item.get("role") is not None:
        _consume_role_message(item, acc)
        return

    acc.unknown += 1
    acc.add_assistant([{"type": "text", "content": _safe_json(item)}])


def _consume_role_message(item: Dict[str, Any], acc: _Accumulator) -> None:
    role = _role(item.get("role"))
    if role == "tool":
        acc.add(
            "tool",
            [
                {
                    "type": "tool_call_response",
                    "id": item.get("tool_call_id") or item.get("call_id") or "",
                    "response": _tool_result(item.get("content")),
                }
            ],
        )
        return
    parts = _content_parts(item.get("content"))
    reasoning = item.get("reasoning")
    if isinstance(reasoning, str) and reasoning.strip():
        parts.insert(0, {"type": "reasoning", "content": reasoning})
    _append_tool_calls(parts, item.get("tool_calls"))
    if role == "assistant":
        acc.add_assistant(parts)
    else:
        acc.add(role, parts)


def _role(raw: Any) -> str:
    if not isinstance(raw, str):
        return "user"
    role = _ROLE_ALIASES.get(raw, raw)
    return role if role in _ROLES else "user"


def _responses_tool_call(item: Dict[str, Any]) -> Dict[str, Any]:
    args = item.get("arguments")
    if item.get("input") is not None and args is None:
        args = item.get("input")
    return {
        "type": "tool_call",
        "id": item.get("call_id") or item.get("id") or "",
        "name": item.get("name") or "",
        "arguments": _parse_arguments(args),
    }


def _reasoning_summary(item: Dict[str, Any]) -> Optional[str]:
    """Summary text only — `encrypted_content` is an opaque provider blob and
    must never leave the machine."""
    summary = item.get("summary")
    if isinstance(summary, str):
        return summary.strip() or None
    texts: List[str] = []
    if isinstance(summary, (list, tuple)):
        for block in summary:
            if isinstance(block, str):
                texts.append(block)
            elif isinstance(block, dict):
                text = block.get("text") or block.get("content")
                if isinstance(text, str):
                    texts.append(text)
    joined = "\n".join(t for t in texts if t.strip())
    return joined or None


def _content_parts(content: Any) -> List[Dict[str, Any]]:
    parts: List[Dict[str, Any]] = []
    if isinstance(content, str):
        if content.strip():
            parts.append({"type": "text", "content": content})
    elif isinstance(content, (list, tuple)):
        for block in content:
            part = _block(block)
            if part:
                parts.append(part)
    elif content is not None:
        parts.append({"type": "text", "content": _safe_json(content)})
    return parts


def _normalize_assistant(obj: Any) -> Optional[Dict[str, Any]]:
    """Assistant output from post_api_request (object, string or Responses items)."""
    if obj is None:
        return None
    if isinstance(obj, str):
        return {"role": "assistant", "parts": [{"type": "text", "content": obj}]} if obj.strip() else None
    if isinstance(obj, (list, tuple)):
        messages, _ = normalize_messages(obj)
        parts = [part for message in messages for part in message["parts"]]
        return {"role": "assistant", "parts": parts} if parts else None
    parts: List[Dict[str, Any]] = []
    reasoning = _get(obj, "reasoning")
    if isinstance(reasoning, str) and reasoning.strip():
        parts.append({"type": "reasoning", "content": reasoning})
    parts.extend(_content_parts(_get(obj, "content")))
    _append_tool_calls(parts, _get(obj, "tool_calls"))
    if not parts:
        return None
    return {"role": "assistant", "parts": parts}


def _block(block: Any) -> Optional[Dict[str, Any]]:
    if isinstance(block, str):
        return {"type": "text", "content": block} if block.strip() else None
    if not isinstance(block, dict):
        return None
    btype = block.get("type") or "text"
    if btype in _TEXT_BLOCKS:
        text = block.get("content") or block.get("text") or ""
        if not isinstance(text, str) or not text.strip():
            return None
        return {"type": "text", "content": text}
    if btype in _REASONING_BLOCKS:
        text = block.get("thinking") or block.get("content") or block.get("text") or ""
        if not isinstance(text, str) or not text.strip():
            return None
        return {"type": "reasoning", "content": text}
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
            "response": _tool_result(block.get("content")),
        }
    if btype in _IMAGE_BLOCKS:
        return _image_part(block)
    return {"type": "text", "content": _safe_json(block)}


def _image_part(block: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    file_id = block.get("file_id")
    if isinstance(file_id, str) and file_id:
        return {"type": "file", "file_id": file_id, "modality": "image"}
    source = block.get("source")
    if isinstance(source, dict):
        data = source.get("data")
        if isinstance(data, str) and data:
            return {
                "type": "blob",
                "content": data,
                "modality": "image",
                "mime_type": source.get("media_type") or source.get("mime_type") or "image/png",
            }
        url = source.get("url")
        if isinstance(url, str) and url:
            return {"type": "uri", "uri": url, "modality": "image"}
    url = block.get("image_url") or block.get("url")
    if isinstance(url, dict):
        url = url.get("url")
    if not isinstance(url, str) or not url:
        return None
    if url.startswith("data:"):
        header, _, data = url[5:].partition(",")
        if not data:
            return None
        return {
            "type": "blob",
            "content": data,
            "modality": "image",
            "mime_type": header.split(";")[0] or "image/png",
        }
    return {"type": "uri", "uri": url, "modality": "image"}


def _append_tool_calls(parts: List[Dict[str, Any]], raw: Any) -> None:
    if not isinstance(raw, (list, tuple)):
        return
    for tc in raw:
        fn = _get(tc, "function")
        name = _get(fn, "name") if fn is not None else _get(tc, "name")
        args = _get(fn, "arguments") if fn is not None else None
        if args is None:
            args = _get(tc, "arguments")
        parts.append(
            {
                "type": "tool_call",
                "id": _get(tc, "id") or _get(tc, "call_id") or "",
                "name": name or "",
                "arguments": _parse_arguments(args),
            }
        )


def _parse_arguments(args: Any) -> Any:
    if isinstance(args, str):
        try:
            return json.loads(args)
        except Exception:
            return args
    return args if args is not None else {}


def _tool_result(raw: Any) -> Any:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, (list, tuple)):
        texts = []
        for block in raw:
            if isinstance(block, str):
                texts.append(block)
            elif isinstance(block, dict):
                text = block.get("text") or block.get("content")
                if isinstance(text, str):
                    texts.append(text)
        joined = "\n".join(t for t in texts if t)
        return joined or _safe_json(raw)
    return raw


def system_instructions_from(system_prompt: Any, messages: Any = None) -> Optional[str]:
    """Resolve the system prompt from the hook kwarg, falling back to the messages.

    Codex/Responses carries it in `instructions` and Anthropic in `system`, so
    only the Chat Completions dialect has it in the message list at all.
    """
    if isinstance(system_prompt, str):
        return system_prompt if system_prompt.strip() else None
    if isinstance(system_prompt, (list, tuple)):
        texts = []
        for block in system_prompt:
            if isinstance(block, str):
                texts.append(block)
            elif isinstance(block, dict):
                text = block.get("text") or block.get("content")
                if isinstance(text, str):
                    texts.append(text)
        joined = "\n".join(t for t in texts if t.strip())
        return joined or None
    if not isinstance(messages, (list, tuple)):
        return None
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in ("system", "developer"):
            continue
        parts = _content_parts(m.get("content"))
        text = "\n".join(p["content"] for p in parts if p["type"] == "text")
        if text.strip():
            return text
    return None


def _count_tool_calls(assistant: Any) -> int:
    tc = _get(assistant, "tool_calls")
    count = len(tc) if isinstance(tc, (list, tuple)) else 0
    content = _get(assistant, "content")
    if isinstance(content, list):
        count += sum(1 for b in content if isinstance(b, dict) and b.get("type") == "tool_use")
    if isinstance(assistant, (list, tuple)):
        count += sum(
            1
            for item in assistant
            if isinstance(item, dict) and item.get("type") in ("function_call", "custom_tool_call")
        )
    return count


def _has_content(assistant: Any, chars: int) -> bool:
    if isinstance(assistant, str):
        return bool(assistant.strip())
    if isinstance(assistant, (list, tuple)):
        return any(
            part["type"] == "text"
            for item in assistant
            for part in _content_parts(_get(item, "content") if isinstance(item, dict) else None)
        )
    content = _get(assistant, "content")
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        return any(part["type"] == "text" for part in _content_parts(content))
    return (chars or 0) > 0
