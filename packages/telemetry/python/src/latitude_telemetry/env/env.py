import os

from latitude_telemetry.util import Model, get_env

DEFAULT_GATEWAY_HOSTNAME = "localhost"
DEFAULT_GATEWAY_PORT = 3002
DEFAULT_GATEWAY_SSL = False


def _get_gateway_base_url() -> str:
    """
    Determine the gateway base URL following TypeScript SDK logic:
    1. Use GATEWAY_BASE_URL if set
    2. Otherwise build from GATEWAY_HOSTNAME/PORT/SSL
    3. Fall back to production default
    """
    base_url = os.getenv("GATEWAY_BASE_URL")
    if base_url:
        return base_url.rstrip("/")

    hostname = os.getenv("GATEWAY_HOSTNAME")
    if hostname:
        ssl = get_env("GATEWAY_SSL", DEFAULT_GATEWAY_SSL)
        port = get_env("GATEWAY_PORT", DEFAULT_GATEWAY_PORT if ssl else 80)
        protocol = "https" if ssl else "http"
        return f"{protocol}://{hostname}:{port}"

    protocol = "https" if DEFAULT_GATEWAY_SSL else "http"
    return f"{protocol}://{DEFAULT_GATEWAY_HOSTNAME}:{DEFAULT_GATEWAY_PORT}"


class Env(Model):
    GATEWAY_BASE_URL: str
    GATEWAY_HOSTNAME: str
    GATEWAY_PORT: int
    GATEWAY_SSL: bool


env = Env(
    GATEWAY_BASE_URL=_get_gateway_base_url(),
    GATEWAY_HOSTNAME=get_env("GATEWAY_HOSTNAME", DEFAULT_GATEWAY_HOSTNAME),
    GATEWAY_PORT=get_env("GATEWAY_PORT", DEFAULT_GATEWAY_PORT),
    GATEWAY_SSL=get_env("GATEWAY_SSL", DEFAULT_GATEWAY_SSL),
)
