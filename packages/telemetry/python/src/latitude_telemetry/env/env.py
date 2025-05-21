from latitude_telemetry.util import Model, get_env

DEFAULT_GATEWAY_HOSTNAME = "gateway.latitude.so"
DEFAULT_GATEWAY_PORT = 443
DEFAULT_GATEWAY_SSL = True


class Env(Model):
    GATEWAY_HOSTNAME: str
    GATEWAY_PORT: int
    GATEWAY_SSL: bool


env = Env(
    GATEWAY_HOSTNAME=get_env("GATEWAY_HOSTNAME", DEFAULT_GATEWAY_HOSTNAME),
    GATEWAY_PORT=get_env("GATEWAY_PORT", DEFAULT_GATEWAY_PORT),
    GATEWAY_SSL=get_env("GATEWAY_SSL", DEFAULT_GATEWAY_SSL),
)
