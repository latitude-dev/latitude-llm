from typing import List, Optional

from latitude_sdk.client import Client, GetAllVersionsRequestParams, RequestHandler
from latitude_sdk.sdk.types import SdkOptions, Version
from latitude_sdk.util import Adapter as AdapterUtil
from latitude_sdk.util import Model

_GetAllVersionsResults = AdapterUtil[List[Version]](List[Version])


class VersionOptions(Model):
    project_id: Optional[int] = None


class GetAllVersionsOptions(VersionOptions, Model):
    pass


class Versions:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    async def get_all(self, options: Optional[GetAllVersionsOptions] = None) -> List[Version]:
        options = GetAllVersionsOptions(**{**dict(self._options), **dict(options or {})})
        if not options.project_id:
            raise ValueError("Project ID is required")

        async with self._client.request(
            handler=RequestHandler.GetAllVersions,
            params=GetAllVersionsRequestParams(project_id=options.project_id),
        ) as response:
            return _GetAllVersionsResults.validate_json(response.content)
