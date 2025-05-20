from typing import Optional

from promptl_ai import Promptl, PromptlOptions

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
    promptl: Optional[PromptlOptions] = None
    internal: Optional[InternalOptions] = None


DEFAULT_INTERNAL_OPTIONS = InternalOptions(
    gateway=GatewayOptions(
        host=env.GATEWAY_HOSTNAME,
        port=env.GATEWAY_PORT,
        ssl=env.GATEWAY_SSL,
        api_version="v3",
    ),
    source=LogSources.Api,
    retries=3,
    delay=0.5,
    timeout=None,
)


DEFAULT_LATITUDE_OPTIONS = LatitudeOptions(
    internal=DEFAULT_INTERNAL_OPTIONS,
)


class Latitude:
    _options: LatitudeOptions
    _client: Client

    promptl: Promptl

    prompts: Prompts
    logs: Logs
    evaluations: Evaluations

    def __init__(self, api_key: str, options: Optional[LatitudeOptions] = None):
        options = LatitudeOptions(**{**dict(DEFAULT_LATITUDE_OPTIONS), **dict(options or {})})
        options.internal = InternalOptions(**{**dict(DEFAULT_INTERNAL_OPTIONS), **dict(options.internal or {})})
        self._options = options

        assert self._options.internal is not None
        assert self._options.internal.gateway is not None
        assert self._options.internal.source is not None
        assert self._options.internal.retries is not None
        assert self._options.internal.delay is not None

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

        self.promptl = Promptl(self._options.promptl)
        self.prompts = Prompts(self._client, self.promptl, self._options)
        self.logs = Logs(self._client, self._options)
        self.evaluations = Evaluations(self._client, self._options)
