from typing import Optional

from latitude_sdk.client import (
    Client,
    GetCommitRequestParams,
    RequestHandler,
)
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.types import Commit, SdkOptions
from latitude_sdk.util import Model


class GetVersionOptions(Model):
    pass


class Versions:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    async def get(self, project_id: int, commit_uuid: str, options: Optional[GetVersionOptions] = None) -> Commit:
        options = GetVersionOptions(**(options or {}))

        async with self._client.request(
            handler=RequestHandler.GetCommit,
            params=GetCommitRequestParams(project_id=project_id, commit_uuid=commit_uuid),
        ) as response:
            return Commit.model_validate_json(response.content)