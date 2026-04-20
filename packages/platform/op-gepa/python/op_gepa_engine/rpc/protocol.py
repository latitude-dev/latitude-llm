import json
import traceback
from typing import Any

from op_gepa_engine.util import Field, Model

JSONRPC_VERSION = "2.0"


class JsonRpcRequest(Model):
    """JSON-RPC 2.0 request message."""

    jsonrpc: str = Field(default=JSONRPC_VERSION)
    method: str
    params: dict[str, Any] = Field(default_factory=dict)
    id: int | str | None = None


class JsonRpcError(Model):
    """JSON-RPC 2.0 error object."""

    code: int
    message: str
    data: Any = None


class JsonRpcResponse(Model):
    """JSON-RPC 2.0 response message."""

    jsonrpc: str = Field(default=JSONRPC_VERSION)
    result: Any = None
    error: JsonRpcError | None = None
    id: int | str | None = None


class JsonRpcEmptyResponse(Model):
    """JSON-RPC 2.0 empty response message."""

    pass


class RpcErrorCode:
    """Standard JSON-RPC 2.0 error codes."""

    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603


def _first_remote_message(value: Any, depth: int = 0) -> str | None:
    if depth >= 4 or not isinstance(value, dict):
        return None

    for key in ("message", "httpMessage", "_tag", "name", "type"):
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    return _first_remote_message(value.get("cause"), depth + 1)


class RpcRemoteError(RuntimeError):
    code: int
    data: Any

    def __init__(self, *, code: int, message: str, data: Any) -> None:
        resolved_message = message.strip() if isinstance(message, str) and message.strip() else _first_remote_message(data)
        super().__init__(resolved_message or "Remote RPC failed")
        self.code = code
        self.data = data


def create_remote_error_exception(error: JsonRpcError) -> RpcRemoteError:
    return RpcRemoteError(
        code=error.code,
        message=error.message,
        data=error.data,
    )


def create_exception_error(error: Exception, error_traceback: str | None = None) -> JsonRpcError:
    traceback_text = error_traceback or traceback.format_exc()
    error_data: dict[str, Any] = {"traceback": traceback_text}

    if isinstance(error, RpcRemoteError):
        error_data["remoteError"] = error.data

    return JsonRpcError(
        code=error.code if isinstance(error, RpcRemoteError) else RpcErrorCode.INTERNAL_ERROR,
        message=str(error),
        data=error_data,
    )


def create_error_response(
    request_id: int | str | None,
    error: Exception,
    error_traceback: str | None = None,
) -> JsonRpcResponse:
    return JsonRpcResponse(
        id=request_id,
        error=create_exception_error(error, error_traceback),
    )


def parse_message(line: str) -> JsonRpcRequest | JsonRpcResponse | None:
    """Parse a JSON-RPC message from a line of text."""

    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    if "method" in data:
        return JsonRpcRequest.model_validate(data)

    if "result" in data or "error" in data:
        return JsonRpcResponse.model_validate(data)

    return None


def serialize_message(msg: JsonRpcRequest | JsonRpcResponse) -> str:
    """Serialize a JSON-RPC message to a newline-terminated string."""

    return msg.model_dump_json() + "\n"
