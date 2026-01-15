import json
from typing import Any

from app.util import Field, Model

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
    elif "result" in data or "error" in data:
        return JsonRpcResponse.model_validate(data)

    return None


def serialize_message(msg: JsonRpcRequest | JsonRpcResponse) -> str:
    """Serialize a JSON-RPC message to a newline-terminated string."""

    return msg.model_dump_json() + "\n"
