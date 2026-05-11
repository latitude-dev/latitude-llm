import os

from latitude_telemetry.util import Model

PRODUCTION_EXPORTER_URL = "https://ingest.latitude.so"


def get_exporter_url() -> str:
    """
    Determine the OTLP exporter base URL.
    Uses LATITUDE_TELEMETRY_URL env var, falling back to the production
    Latitude ingest endpoint. Set LATITUDE_TELEMETRY_URL explicitly
    (e.g. http://localhost:3002) for local development.
    """
    url = os.getenv("LATITUDE_TELEMETRY_URL")
    if url:
        return url.rstrip("/")

    return PRODUCTION_EXPORTER_URL


class Env(Model):
    EXPORTER_URL: str


env = Env(
    EXPORTER_URL=get_exporter_url(),
)
