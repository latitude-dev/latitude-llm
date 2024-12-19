from typing import Optional

from latitude_sdk.client import Client, ClientOptions, RouterOptions
from latitude_sdk.env import env
from latitude_sdk.sdk.evaluations import Evaluations
from latitude_sdk.sdk.logs import Logs
from latitude_sdk.sdk.prompts import Prompts
from latitude_sdk.sdk.types import GatewayOptions, LogSources, SdkOptions
from latitude_sdk.util import Model


class InternalOptions(Model):
    gateway: Optional[GatewayOptions] = None
    source: Optional[LogSources] = None
    retries: Optional[int] = None
    delay: Optional[float] = None
    timeout: Optional[float] = None


class LatitudeOptions(SdkOptions, Model):
    internal: Optional[InternalOptions] = None


DEFAULT_INTERNAL_OPTIONS = InternalOptions(
    gateway=GatewayOptions(
        host=env.GATEWAY_HOSTNAME,
        port=env.GATEWAY_PORT,
        ssl=env.GATEWAY_SSL,
        api_version="v2",
    ),
    source=LogSources.Api,
    retries=3,
    delay=0.5,
    timeout=30,
)


DEFAULT_LATITUDE_OPTIONS = LatitudeOptions(internal=DEFAULT_INTERNAL_OPTIONS)


class Latitude:
    _options: LatitudeOptions
    _client: Client

    prompts: Prompts
    logs: Logs
    evaluations: Evaluations

    def __init__(self, api_key: str, options: LatitudeOptions = DEFAULT_LATITUDE_OPTIONS):
        options.internal = options.internal or DEFAULT_INTERNAL_OPTIONS
        options.internal = InternalOptions(**{**dict(DEFAULT_INTERNAL_OPTIONS), **dict(options.internal)})
        options = LatitudeOptions(**{**dict(DEFAULT_LATITUDE_OPTIONS), **dict(options)})

        assert options.internal is not None
        assert options.internal.gateway is not None
        assert options.internal.source is not None
        assert options.internal.retries is not None
        assert options.internal.delay is not None
        assert options.internal.timeout is not None

        self._options = options
        self._client = Client(
            ClientOptions(
                api_key=api_key,
                retries=options.internal.retries,
                delay=options.internal.delay,
                timeout=options.internal.timeout,
                source=options.internal.source,
                router=RouterOptions(gateway=options.internal.gateway),
            )
        )

        self.prompts = Prompts(self._client, self._options)
        self.logs = Logs(self._client, self._options)
        self.evaluations = Evaluations(self._client, self._options)
        # TODO: Telemetry - needs Telemetry SDK in Python
