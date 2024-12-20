from typing import Optional

from latitude_sdk import core
from latitude_sdk.env import env
from latitude_sdk.util import BaseModel


class InternalOptions(BaseModel):
    gateway: Optional[core.GatewayOptions] = None
    source: Optional[core.LogSources] = None
    retries: Optional[int] = None
    delay: Optional[float] = None
    timeout: Optional[float] = None


class LatitudeOptions(BaseModel):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None
    internal: Optional[InternalOptions] = None


DEFAULT_INTERNAL_OPTIONS = InternalOptions(
    gateway=core.GatewayOptions(
        host=env.GATEWAY_HOSTNAME,
        port=env.GATEWAY_PORT,
        ssl=env.GATEWAY_SSL,
        api_version="v2",
    ),
    source=core.LogSources.API,
    retries=3,
    delay=0.5,
    timeout=30,
)


DEFAULT_LATITUDE_OPTIONS = LatitudeOptions(internal=DEFAULT_INTERNAL_OPTIONS)


class Prompts:
    _sdk: "Latitude"

    _getPrompt: core.GetPrompt
    _runPrompt: core.RunPrompt

    def __init__(self, sdk: "Latitude"):
        self._sdk = sdk

        self._getPrompt = core.GetPrompt(sdk._client)
        self._runPrompt = core.RunPrompt(sdk._client)

    def _ensure_options(self, options: core.PromptOptions) -> core.PromptOptions:
        project_id = options.project_id or self._sdk._options.project_id
        if not project_id:
            raise ValueError("Project ID is required")

        version_uuid = options.version_uuid or self._sdk._options.version_uuid

        return core.PromptOptions(project_id=project_id, version_uuid=version_uuid)

    async def get(self, path: str, options: core.GetPromptOptions) -> core.GetPromptResult:
        prompt_options = self._ensure_options(options)
        options = core.GetPromptOptions(**{**dict(options), **dict(prompt_options)})

        return await self._getPrompt.get(path, options)

    async def run(self, path: str, options: core.RunPromptOptions) -> core.RunPromptResult:
        prompt_options = self._ensure_options(options)
        options = core.RunPromptOptions(**{**dict(options), **dict(prompt_options)})

        return await self._runPrompt.run(path, options)


class Latitude:
    _options: LatitudeOptions
    _client: core.Client

    prompts: Prompts

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
        self._client = core.Client(
            core.ClientOptions(
                api_key=api_key,
                retries=options.internal.retries,
                delay=options.internal.delay,
                timeout=options.internal.timeout,
                source=options.internal.source,
                router=core.RouterOptions(gateway=options.internal.gateway),
            )
        )

        self.prompts = Prompts(self)

    async def close(self):
        await self._client.close()
