from typing import Optional

from latitude_telemetry import InternalOptions as TelemetryInternalOptions
from latitude_telemetry import Telemetry, TelemetryOptions

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
    telemetry: Optional[TelemetryOptions] = None
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


DEFAULT_LATITUDE_OPTIONS = LatitudeOptions(
    telemetry=None,  # Note: Telemetry is opt-in
    internal=DEFAULT_INTERNAL_OPTIONS,
)


class Latitude:
    _options: LatitudeOptions
    _client: Client

    telemetry: Optional[Telemetry]

    prompts: Prompts
    logs: Logs
    evaluations: Evaluations

    def __init__(self, api_key: str, options: LatitudeOptions):
        options.internal = InternalOptions(**{**dict(DEFAULT_INTERNAL_OPTIONS), **dict(options.internal or {})})
        options = LatitudeOptions(**{**dict(DEFAULT_LATITUDE_OPTIONS), **dict(options)})
        self._options = options

        assert self._options.internal is not None
        assert self._options.internal.gateway is not None
        assert self._options.internal.source is not None
        assert self._options.internal.retries is not None
        assert self._options.internal.delay is not None
        assert self._options.internal.timeout is not None

        self._client = Client(
            ClientOptions(
                api_key=api_key,
                retries=self._options.internal.retries,
                delay=self._options.internal.delay,
                timeout=self._options.internal.timeout,
                source=self._options.internal.source,
                router=RouterOptions(gateway=self._options.internal.gateway),
            )
        )

        if self._options.telemetry:
            self._options.telemetry.internal = TelemetryInternalOptions(
                **{**dict(self._options.internal), **dict(self._options.telemetry.internal or {})}
            )
            self.telemetry = Telemetry(api_key, self._options.telemetry)

        self.prompts = Prompts(self._client, self._options)
        self.logs = Logs(self._client, self._options)
        self.evaluations = Evaluations(self._client, self._options)
