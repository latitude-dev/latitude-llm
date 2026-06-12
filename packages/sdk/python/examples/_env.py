import os
import typing


def require_env(name: str) -> str:
    """Read a required env var, failing fast with a human-readable message."""
    value = os.environ.get(name, "")
    if not value.strip():
        raise RuntimeError(
            f"Missing required env var `{name}`. Copy `.env.example` to `.env` and fill it in — see README.md."
        )
    return value


def optional_env(name: str) -> typing.Optional[str]:
    """Read an optional env var, mapping blank to None."""
    return os.environ.get(name, "").strip() or None
