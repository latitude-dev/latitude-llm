import json
from typing import List, cast

import httpx

from latitude_sdk import CreateLogOptions, CreateLogResult
from tests.utils import TestCase, fixtures


class TestCreateLog(TestCase):
    async def test_success_global_options(self):
        path = "prompt-path"
        messages = self.create_conversation(4)
        options = CreateLogOptions(response="response")
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/logs"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.LOG_RESPONSE)
        )

        result = await self.sdk.logs.create(path, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "response": options.response,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, CreateLogResult(**dict(fixtures.LOG)))

    async def test_success_overrides_options(self):
        path = "prompt-path"
        messages = self.create_conversation(4)
        options = CreateLogOptions(project_id=21, version_uuid="version-uuid", response="response")
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents/logs"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.LOG_RESPONSE)
        )

        result = await self.sdk.logs.create(path, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "response": options.response,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, CreateLogResult(**dict(fixtures.LOG)))

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
        path = "prompt-path"
        messages = self.create_conversation(4)
        options = CreateLogOptions(response="response")
        endpoint = f"/projects/{self.project_id}/versions/live/documents/logs"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.LOG_RESPONSE)
        )

        result = await self.sdk.logs.create(path, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "response": options.response,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, CreateLogResult(**dict(fixtures.LOG)))

    async def test_fails(self):
        path = "prompt-path"
        messages = self.create_conversation(4)
        options = CreateLogOptions(response="response")
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/logs"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.logs.create(path, messages, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "path": path,
                    "messages": [json.loads(message.model_dump_json()) for message in messages],
                    "response": options.response,
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
