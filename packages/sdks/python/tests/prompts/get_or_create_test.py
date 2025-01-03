from typing import List, cast

import httpx

from latitude_sdk import GetOrCreatePromptOptions, GetOrCreatePromptResult
from tests.utils import TestCase, fixtures


class TestGetOrCreatePrompt(TestCase):
    async def test_success_global_options(self):
        path = "prompt-path"
        options = GetOrCreatePromptOptions(prompt="prompt")
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.PROMPT_RESPONSE)
        )

        result = await self.sdk.prompts.get_or_create(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "prompt": options.prompt,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, GetOrCreatePromptResult(**dict(fixtures.PROMPT)))

    async def test_success_overrides_options(self):
        path = "prompt-path"
        options = GetOrCreatePromptOptions(project_id=21, version_uuid="version-uuid", prompt="prompt")
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.PROMPT_RESPONSE)
        )

        result = await self.sdk.prompts.get_or_create(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "prompt": options.prompt,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, GetOrCreatePromptResult(**dict(fixtures.PROMPT)))

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
        path = "prompt-path"
        options = GetOrCreatePromptOptions(prompt="prompt")
        endpoint = f"/projects/{self.project_id}/versions/live/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.PROMPT_RESPONSE)
        )

        result = await self.sdk.prompts.get_or_create(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "prompt": options.prompt,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, GetOrCreatePromptResult(**dict(fixtures.PROMPT)))

    async def test_fails(self):
        path = "prompt-path"
        options = GetOrCreatePromptOptions(prompt="prompt")
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.prompts.get_or_create(path, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "path": path,
                    "prompt": options.prompt,
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
