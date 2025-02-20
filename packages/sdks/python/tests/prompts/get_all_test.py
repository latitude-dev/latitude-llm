from typing import List, cast

import httpx

from latitude_sdk.sdk.prompts import GetAllPromptOptions, GetPromptResult
from tests.utils import TestCase, fixtures


class TestGetAllPrompts(TestCase):
    async def test_success_global_options(self):
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=[fixtures.PROMPT_RESPONSE])
        )

        result = await self.sdk.prompts.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [GetPromptResult(**dict(fixtures.PROMPT))])

    async def test_success_overrides_options(self):
        options = GetAllPromptOptions(project_id=21, version_uuid="version-uuid")
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=[fixtures.PROMPT_RESPONSE])
        )

        result = await self.sdk.prompts.get_all(options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [GetPromptResult(**dict(fixtures.PROMPT))])

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
        endpoint = f"/projects/{self.project_id}/versions/live/documents"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=[fixtures.PROMPT_RESPONSE])
        )

        result = await self.sdk.prompts.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [GetPromptResult(**dict(fixtures.PROMPT))])

    async def test_fails(self):
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.prompts.get_all()
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [self.assert_requested(request, method="GET", endpoint=endpoint) for request in requests]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
