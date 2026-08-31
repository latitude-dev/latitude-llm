"""latitude — Hermes plugin that streams sessions to Latitude as OTLP traces."""

from .hooks import child_env, current_traceparent, register

__all__ = ["child_env", "current_traceparent", "register"]
