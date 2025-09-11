from typing import List, cast
from unittest.mock import AsyncMock

import httpx

from latitude_sdk import (
    GetOrCreatePromptResult,
    GetPromptResult,
    RunPromptOptions,
    RunPromptResult,
    StreamEvent,
    __version_semver__,
)
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

        self.assert_requested(
            request,
            method="GET",
            endpoint=endpoint,
            headers={
                "authorization": f"Bearer {self.api_key}",
                "x-latitude-sdk-version": __version_semver__,
                "content-type": "application/json",
                "accept": "application/json",
            },
        )
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

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            headers={
                "authorization": f"Bearer {self.api_key}",
                "x-latitude-sdk-version": __version_semver__,
                "content-type": "application/json",
                "accept": "application/json",
            },
            body={"path": path},
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, GetOrCreatePromptResult(**dict(fixtures.PROMPT)))

    async def test_success_streaming(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=True,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last
        events = cast(list[StreamEvent], [event[0] for event, _ in on_event_mock.await_args_list])

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            headers={
                "authorization": f"Bearer {self.api_key}",
                "x-latitude-sdk-version": __version_semver__,
                "content-type": "application/json",
                "accept": "text/event-stream",
            },
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, RunPromptResult(**dict(fixtures.CONVERSATION_FINISHED_RESULT)))
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.await_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()

    async def test_fails_directly(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(400, json=fixtures.CLIENT_ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.CLIENT_ERROR), fixtures.CLIENT_ERROR.message):
            await self.sdk.prompts.get_or_create(path)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            headers={
                "authorization": f"Bearer {self.api_key}",
                "x-latitude-sdk-version": __version_semver__,
                "content-type": "application/json",
                "accept": "application/json",
            },
            body={"path": path},
        )
        self.assertEqual(endpoint_mock.call_count, 1)

    async def test_fails_streaming(self):
        on_event_mock = AsyncMock(side_effect=Exception("Unexpected client error"))
        on_finished_mock = AsyncMock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=True,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), "Unexpected client error"):
            await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            headers={
                "authorization": f"Bearer {self.api_key}",
                "x-latitude-sdk-version": __version_semver__,
                "content-type": "application/json",
                "accept": "text/event-stream",
            },
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        on_event_mock.assert_awaited_once()
        on_finished_mock.assert_not_awaited()

    async def test_fails_retrying(self):
        path = "prompt-path"
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/get-or-create"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.prompts.get_or_create(path)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                headers={
                    "authorization": f"Bearer {self.api_key}",
                    "x-latitude-sdk-version": __version_semver__,
                    "content-type": "application/json",
                    "accept": "application/json",
                },
                body={"path": path},
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
