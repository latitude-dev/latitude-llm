import os

from latitude_telemetry.util import Model

DEFAULT_EXPORTER_URL = "http://localhost:3002"


def _get_exporter_url() -> str:
    """
    Determine the OTLP exporter base URL.
    Uses LATITUDE_TELEMETRY_URL env var, falling back to localhost:3002.
    """
    url = os.getenv("LATITUDE_TELEMETRY_URL")
    if url:
        return url.rstrip("/")

    return DEFAULT_EXPORTER_URL


class Env(Model):
    EXPORTER_URL: str


env = Env(
    EXPORTER_URL=_get_exporter_url(),
)
