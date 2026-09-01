"""latitude — Hermes plugin that streams sessions to Latitude as OTLP traces."""

from .hooks import register
from .propagation import child_env, current_traceparent

__all__ = ["child_env", "current_traceparent", "register"]
