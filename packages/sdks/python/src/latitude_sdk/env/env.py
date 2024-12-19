import os
from typing import List, TypeVar

from latitude_sdk.util import Model

DEFAULT_GATEWAY_HOSTNAME = "gateway.latitude.so"
DEFAULT_GATEWAY_PORT = 8787
DEFAULT_GATEWAY_SSL = True

T = TypeVar("T", str, bool, int, List[str])


def get_env(key: str, default: T) -> T:
    value = os.getenv(key)
    if not value:
        return default

    if isinstance(default, str):
        return value

    elif isinstance(default, bool):
        return value.lower() in ["true", "1", "yes", "on"]

    elif isinstance(default, int):
        return int(value)

    elif isinstance(default, list):
        return value.split(",")

    raise TypeError(f"Unknown type {type(default)}")


class Env(Model):
    GATEWAY_HOSTNAME: str
    GATEWAY_PORT: int
    GATEWAY_SSL: bool


env = Env(
    GATEWAY_HOSTNAME=get_env("GATEWAY_HOSTNAME", DEFAULT_GATEWAY_HOSTNAME),
    GATEWAY_PORT=get_env("GATEWAY_PORT", DEFAULT_GATEWAY_PORT),
    GATEWAY_SSL=get_env("GATEWAY_SSL", DEFAULT_GATEWAY_SSL),
)
