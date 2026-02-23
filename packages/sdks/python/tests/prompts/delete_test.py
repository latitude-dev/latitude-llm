from typing import List, cast

import httpx

from latitude_sdk import DeletePromptOptions, DeletePromptResult
from tests.utils import TestCase, fixtures

DELETE_RESPONSE = {
    "documentUuid": "e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    "path": "prompt-path",
}

DELETE_RESULT = DeletePromptResult(
    document_uuid="e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    path="prompt-path",
)


class TestDeletePrompt(TestCase):
    async def test_success_global_options(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/{path}"
        endpoint_mock = self.gateway_mock.delete(endpoint).mock(return_value=httpx.Response(200, json=DELETE_RESPONSE))

        result = await self.sdk.prompts.delete(path)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="DELETE", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, DELETE_RESULT)

    async def test_success_overrides_options(self):
        path = "prompt-path"
        options = DeletePromptOptions(project_id=21, version_uuid="version-uuid")
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents/{path}"
        endpoint_mock = self.gateway_mock.delete(endpoint).mock(return_value=httpx.Response(200, json=DELETE_RESPONSE))

        result = await self.sdk.prompts.delete(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="DELETE", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, DELETE_RESULT)

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/live/documents/{path}"
        endpoint_mock = self.gateway_mock.delete(endpoint).mock(return_value=httpx.Response(200, json=DELETE_RESPONSE))

        result = await self.sdk.prompts.delete(path)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="DELETE", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, DELETE_RESULT)

    async def test_fails(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/{path}"
        endpoint_mock = self.gateway_mock.delete(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.prompts.delete(path)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [self.assert_requested(request, method="DELETE", endpoint=endpoint) for request in requests]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
