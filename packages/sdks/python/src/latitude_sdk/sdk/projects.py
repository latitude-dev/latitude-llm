from typing import List

from latitude_sdk.client import Client, CreateProjectRequestBody, GetAllVersionsRequestParams, RequestHandler
from latitude_sdk.sdk.types import Project, SdkOptions, Version
from latitude_sdk.util import Adapter as AdapterUtil
from latitude_sdk.util import Model

_GetAllProjectsResult = AdapterUtil[List[Project]](List[Project])
_GetAllVersionsResult = AdapterUtil[List[Version]](List[Version])


class CreateProjectResult(Model):
    project: Project
    version: Version


class Projects:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    async def get_all(self) -> List[Project]:
        async with self._client.request(
            handler=RequestHandler.GetAllProjects,
        ) as response:
            return _GetAllProjectsResult.validate_json(response.content)

    async def create(self, name: str) -> CreateProjectResult:
        async with self._client.request(
            handler=RequestHandler.CreateProject,
            body=CreateProjectRequestBody(name=name),
        ) as response:
            return CreateProjectResult.model_validate_json(response.content)

    async def get_all_versions(self, project_id: int) -> List[Version]:
        async with self._client.request(
            handler=RequestHandler.GetAllVersions,
            params=GetAllVersionsRequestParams(project_id=project_id),
        ) as response:
            return _GetAllVersionsResult.validate_json(response.content)
