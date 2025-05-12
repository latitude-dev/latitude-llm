from typing import Optional
from dotenv import load_dotenv
import os
from latitude_sdk import Latitude, LatitudeOptions, InternalOptions, GatewayOptions

load_dotenv()

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
GATEWAY_HOST = os.getenv("GATEWAY_HOST")
GATEWAY_PORT = os.getenv("GATEWAY_PORT")

def create_sdk(options: Optional[LatitudeOptions] = None):
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    gateway = None

    if (GATEWAY_HOST and GATEWAY_PORT):
        gateway = GatewayOptions(
            host=GATEWAY_HOST,
            port=int(GATEWAY_PORT),
            ssl=False,
            api_version="v3"
        )
    sdk = Latitude(
        LATITUDE_API_KEY,
        LatitudeOptions(
            project_id=options.project_id if options else None,
            version_uuid=options.version_uuid if options else None,
            internal=InternalOptions(gateway=gateway)
        )
    )
    return sdk
