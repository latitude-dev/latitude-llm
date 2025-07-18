from typing import List, cast

import httpx

from latitude_sdk import GetOrCreatePromptResult, GetPromptResult
from tests.utils import TestCase, fixtures


class TestClient(TestCase):
    async def test_success_get(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/{path}"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.PROMPT_RESPONSE)
        )

        result = await self.sdk.prompts.get(path)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, GetPromptResult(**dict(fixtures.PROMPT)))

    async def test_success_post(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.PROMPT_RESPONSE)
        )

        result = await self.sdk.prompts.get_or_create(path)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="POST", endpoint=endpoint, body={"path": path})
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, GetOrCreatePromptResult(**dict(fixtures.PROMPT)))

    async def test_fails_directly(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(400, json=fixtures.CLIENT_ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.CLIENT_ERROR), fixtures.CLIENT_ERROR.message):
            await self.sdk.prompts.get_or_create(path)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="POST", endpoint=endpoint, body={"path": path})
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)

    async def test_fails_retrying(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.prompts.get_or_create(path)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [self.assert_requested(request, method="POST", endpoint=endpoint, body={"path": path}) for request in requests]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
