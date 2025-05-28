import os
from latitude_sdk import GatewayOptions


def get_local_gateway() -> GatewayOptions:
    gateway_host = os.getenv("GATEWAY_HOST")
    gateway_port = os.getenv("GATEWAY_PORT")

    gateway_options = None

    if gateway_host and gateway_port:
        gateway_options = GatewayOptions(host=gateway_host, port=int(gateway_port), ssl=False, api_version="v3")

    return gateway_options
