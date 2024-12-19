from latitude_sdk.core.client import Client
from latitude_sdk.core.common import GetPromptRequestParams, GetPromptResponse, HandlerType, Prompt, PromptOptions
from latitude_sdk.util import BaseModel


class GetPromptOptions(PromptOptions, BaseModel):
    pass


class GetPromptResult(Prompt, BaseModel):
    pass


class GetPrompt:
    client: Client

    def __init__(self, client: Client):
        self.client = client

    def get(self, path: str, options: GetPromptOptions) -> GetPromptResult:
        assert options.project_id is not None

        response = self.client.request(
            handler=HandlerType.GET_PROMPT,
            params=GetPromptRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
                path=path,
            ),
        )

        return response.json()
