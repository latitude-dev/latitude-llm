from typing import List, cast
from unittest.mock import Mock

import httpx

from latitude_sdk import RunPromptOptions, RunPromptResult, StreamEvent
from tests.utils import TestCase, fixtures


class TestRunPromptSync(TestCase):
    async def test_success_global_options(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_EVENT_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, RunPromptResult(**dict(fixtures.CONVERSATION_FINISHED_EVENT)))
        on_event_mock.assert_not_called()
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_EVENT)
        on_error_mock.assert_not_called()

    async def test_success_overrides_options(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            project_id=21,
            version_uuid="version-uuid",
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=False,
        )
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_EVENT_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, RunPromptResult(**dict(fixtures.CONVERSATION_FINISHED_EVENT)))
        on_event_mock.assert_not_called()
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_EVENT)
        on_error_mock.assert_not_called()

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/live/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_EVENT_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, RunPromptResult(**dict(fixtures.CONVERSATION_FINISHED_EVENT)))
        on_event_mock.assert_not_called()
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_EVENT)
        on_error_mock.assert_not_called()

    async def test_fails_and_retries(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "path": path,
                    "customIdentifier": options.custom_identifier,
                    "parameters": options.parameters,
                    "stream": options.stream,
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
        self.assertEqual(result, None)
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.ERROR)

    async def test_fails_and_raises(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(400, json=fixtures.CONVERSATION_ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.CONVERSATION_ERROR), fixtures.CONVERSATION_ERROR.message):
            await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()

    async def test_fails_and_callbacks(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(400, json=fixtures.CONVERSATION_ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, None)
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.CONVERSATION_ERROR)


class TestRunPromptStream(TestCase):
    async def test_success_global_options(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.call_args_list])  # type: ignore

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, RunPromptResult(**dict(fixtures.CONVERSATION_FINISHED_EVENT)))
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.call_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_EVENT)
        on_error_mock.assert_not_called()

    async def test_success_overrides_options(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            project_id=21,
            version_uuid="version-uuid",
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=True,
        )
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.call_args_list])  # type: ignore

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, RunPromptResult(**dict(fixtures.CONVERSATION_FINISHED_EVENT)))
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.call_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_EVENT)
        on_error_mock.assert_not_called()

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=True,
        )
        endpoint = f"/projects/{self.project_id}/versions/live/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.call_args_list])  # type: ignore

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, RunPromptResult(**dict(fixtures.CONVERSATION_FINISHED_EVENT)))
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.call_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_EVENT)
        on_error_mock.assert_not_called()

    async def test_fails_and_retries(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "path": path,
                    "customIdentifier": options.custom_identifier,
                    "parameters": options.parameters,
                    "stream": options.stream,
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
        self.assertEqual(result, None)
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.ERROR)

    async def test_fails_and_raises(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
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
            return_value=self.create_stream(200, fixtures.CONVERSATION_ERROR_EVENT_STREAM)
        )

        with self.assertRaisesRegex(type(fixtures.CONVERSATION_ERROR), fixtures.CONVERSATION_ERROR.message):
            await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()

    async def test_fails_and_callbacks(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
            return_value=self.create_stream(200, fixtures.CONVERSATION_ERROR_EVENT_STREAM)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, None)
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.CONVERSATION_ERROR)
