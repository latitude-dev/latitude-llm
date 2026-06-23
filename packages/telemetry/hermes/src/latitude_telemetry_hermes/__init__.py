"""latitude — Hermes plugin that streams sessions to Latitude as OTLP traces."""

from .hooks import register

__all__ = ["register"]
