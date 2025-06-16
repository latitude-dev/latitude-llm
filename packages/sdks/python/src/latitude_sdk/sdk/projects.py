from typing import List, Optional

from latitude_sdk.client import (
    Client,
    CreateProjectRequestBody,
    CreateProjectRequestParams,
    GetAllProjectsRequestParams,
    RequestHandler,
)
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.types import Project, SdkOptions
from latitude_sdk.util import Adapter, Model


class GetAllProjectsOptions(Model):
    pass


class CreateProjectOptions(Model):
    pass


_GetAllProjectsResults = Adapter[List[Project]](List[Project])


class Projects:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    async def get_all(self, options: Optional[GetAllProjectsOptions] = None) -> List[Project]:
        options = GetAllProjectsOptions(**(options or {}))

        async with self._client.request(
            handler=RequestHandler.GetAllProjects,
            params=GetAllProjectsRequestParams(),
        ) as response:
            return _GetAllProjectsResults.validate_json(response.content)

    async def create(self, name: str, options: Optional[CreateProjectOptions] = None) -> Project:
        options = CreateProjectOptions(**(options or {}))

        async with self._client.request(
            handler=RequestHandler.CreateProject,
            params=CreateProjectRequestParams(),
            body=CreateProjectRequestBody(name=name),
        ) as response:
            return Project.model_validate_json(response.content)