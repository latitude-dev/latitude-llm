import json
from typing import List

from latitude_sdk.client import Client
from latitude_sdk.client.payloads import CreateProjectRequestBody, RequestHandler
from latitude_sdk.sdk.types import Project, SdkOptions, Version


class CreateProjectResponse:
    def __init__(self, project: Project, version: Version):
        self.project = project
        self.version = version


class Projects:
    _client: Client
    _options: SdkOptions

    def __init__(self, client: Client, options: SdkOptions):
        self._client = client
        self._options = options

    async def get_all(self) -> List[Project]:
        async with self._client.request(
            handler=RequestHandler.GetAllProjects,
            params=None,
        ) as response:
            projects_data = json.loads(response.content)
            return [Project.model_validate_json(json.dumps(project)) for project in projects_data]

    async def create(self, name: str) -> CreateProjectResponse:
        async with self._client.request(
            handler=RequestHandler.CreateProject,
            params=None,
            body=CreateProjectRequestBody(name=name),
        ) as response:
            response_data = json.loads(response.content)
            return CreateProjectResponse(
                project=Project.model_validate_json(json.dumps(response_data["project"])),
                version=Version.model_validate_json(json.dumps(response_data["version"])),
            )
