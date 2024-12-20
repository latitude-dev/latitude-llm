from typing import Any, Dict, Optional

from latitude_sdk.core.client import Client, ClientResponse
from latitude_sdk.core.common import (
    EventCallbacks,
    PromptOptions,
    RequestHandler,
    RunPromptRequestBody,
    RunPromptRequestParams,
    RunPromptResponse,
)
from latitude_sdk.util import BaseModel


class RunPromptOptions(EventCallbacks, PromptOptions, BaseModel):
    custom_identifier: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    stream: Optional[bool] = None


# TODO
class RunPromptResult(BaseModel):
    pass


class RunPrompt:
    client: Client

    def __init__(self, client: Client):
        self.client = client

    async def _run_sync(self, response: ClientResponse) -> RunPromptResult:
        # TODO: Use RunPromptResponse?
        return await self.client.json(response)

    async def _run_stream(self, response: ClientResponse) -> RunPromptResult:
        # TODO: Use RunPromptResponse?
        return await self.client.sse(response)

    async def run(self, path: str, options: RunPromptOptions) -> RunPromptResult:
        assert options.project_id is not None

        async with self.client.request(
            handler=RequestHandler.RUN_PROMPT,
            params=RunPromptRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
            ),
            body=RunPromptRequestBody(
                path=path,
                parameters=options.parameters,
                custom_identifier=options.custom_identifier,
                stream=options.stream,
            ),
        ) as response:
            if options.stream:
                return await self._run_stream(response)

            return await self._run_sync(response)
