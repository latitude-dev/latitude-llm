from typing import cast
from unittest.mock import AsyncMock

import httpx

from latitude_sdk import OnToolCallDetails, RunPromptOptions, StreamEvent
from tests.utils import TestCase, fixtures


class TestRunPromptSync(TestCase):
    async def test_success_global_options(self):
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
            stream=False,
            background=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE)
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
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()

    async def test_success_overrides_options(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
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
            background=False,
        )
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE)
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
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
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
            stream=False,
            background=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/live/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE)
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
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()

    async def test_success_with_tools(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        actual_tool_mock = AsyncMock(
            side_effect=[
                r.result if not r.is_error else Exception(r.result) for r in fixtures.CONVERSATION_TOOL_RESULTS
            ]
        )
        other_tool_mock = AsyncMock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            tools={"calculator": actual_tool_mock, "other_tool": other_tool_mock},
            stream=False,
            background=False,
        )
        run_endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        run_endpoint_mock = self.gateway_mock.post(run_endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE)
        )
        tools_endpoint = "/tools/results"
        tools_endpoint_mock = self.gateway_mock.post(tools_endpoint).mock(return_value=httpx.Response(200))

        result = await self.sdk.prompts.run(path, options)
        run_request, _ = run_endpoint_mock.calls.last

        self.assert_requested(
            run_request,
            method="POST",
            endpoint=run_endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "tools": list((options.tools or {}).keys()),
                "stream": options.stream,
                "background": options.background,
            },
        )
        self.assertEqual(run_endpoint_mock.call_count, 1)
        self.assertEqual(tools_endpoint_mock.call_count, 0)
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()
        actual_tool_mock.assert_not_awaited()
        other_tool_mock.assert_not_awaited()

    async def test_fails_and_retries(self):
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
            stream=False,
            background=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        requests = cast(list[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

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
                    "background": options.background,
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
        self.assertEqual(result, None)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()
        on_error_mock.assert_awaited_once_with(fixtures.ERROR)

    async def test_fails_and_raises(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=False,
            background=False,
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
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()

    async def test_fails_and_callbacks(self):
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
            stream=False,
            background=False,
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
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, None)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()
        on_error_mock.assert_awaited_once_with(fixtures.CONVERSATION_ERROR)


class TestRunPromptStream(TestCase):
    async def test_success_global_options(self):
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
            background=False,
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
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.await_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()

    async def test_success_overrides_options(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
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
            background=False,
        )
        endpoint = f"/projects/{options.project_id}/versions/{options.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )

        result = await self.sdk.prompts.run(path, options)
        request, _ = endpoint_mock.calls.last
        events = cast(list[StreamEvent], [event[0] for event, _ in on_event_mock.await_args_list])

        print(result)
        print(fixtures.CONVERSATION_FINISHED_RESULT)
        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.await_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()

    async def test_success_default_version_uuid(self):
        self.sdk._options.version_uuid = None  # pyright: ignore [reportPrivateUsage]
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
            background=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/live/documents/run"
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
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "stream": options.stream,
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.await_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()

    async def test_success_with_tools(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        actual_tool_mock = AsyncMock(
            side_effect=[
                r.result if not r.is_error else Exception(r.result) for r in fixtures.CONVERSATION_TOOL_RESULTS
            ]
        )
        other_tool_mock = AsyncMock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            tools={"calculator": actual_tool_mock, "other_tool": other_tool_mock},
            stream=True,
            background=False,
        )
        run_endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        run_endpoint_mock = self.gateway_mock.post(run_endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )
        tools_endpoint = "/tools/results"
        tools_endpoint_mock = self.gateway_mock.post(tools_endpoint).mock(return_value=httpx.Response(200))

        result = await self.sdk.prompts.run(path, options)
        run_request, _ = run_endpoint_mock.calls.last
        tools_requests = cast(list[httpx.Request], [request for request, _ in tools_endpoint_mock.calls])  # type: ignore
        events = cast(list[StreamEvent], [event[0] for event, _ in on_event_mock.await_args_list])

        self.assert_requested(
            run_request,
            method="POST",
            endpoint=run_endpoint,
            body={
                "path": path,
                "customIdentifier": options.custom_identifier,
                "parameters": options.parameters,
                "tools": list((options.tools or {}).keys()),
                "stream": options.stream,
                "background": options.background,
            },
        )
        self.assertEqual(run_endpoint_mock.call_count, 1)
        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=tools_endpoint,
                body={
                    "toolCallId": fixtures.CONVERSATION_TOOL_RESULTS[index].id,
                    "result": fixtures.CONVERSATION_TOOL_RESULTS[index].result,
                    "isError": fixtures.CONVERSATION_TOOL_RESULTS[index].is_error,
                },
            )
            for index, request in enumerate(tools_requests)
        ]
        self.assertEqual(tools_endpoint_mock.call_count, len(fixtures.CONVERSATION_TOOL_CALLS))
        self.assertEqual(result, fixtures.CONVERSATION_FINISHED_RESULT)
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.await_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()
        [
            self.assertEqual(
                actual_tool_mock.await_args_list[index][0],
                (
                    fixtures.CONVERSATION_TOOL_CALLS[index].arguments,
                    OnToolCallDetails.model_construct(
                        id=fixtures.CONVERSATION_TOOL_CALLS[index].id,
                        name=fixtures.CONVERSATION_TOOL_CALLS[index].name,
                        arguments=fixtures.CONVERSATION_TOOL_CALLS[index].arguments,
                    ),
                ),
            )
            for index, _ in enumerate(actual_tool_mock.await_args_list)
        ]
        self.assertEqual(actual_tool_mock.await_count, len(fixtures.CONVERSATION_TOOL_CALLS))
        other_tool_mock.assert_not_awaited()

    async def test_fails_and_retries(self):
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
            background=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.run(path, options)
        requests = cast(list[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

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
                    "background": options.background,
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
        self.assertEqual(result, None)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()
        on_error_mock.assert_awaited_once_with(fixtures.ERROR)

    async def test_fails_and_raises(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        path = "prompt-path"
        options = RunPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            custom_identifier="custom-identifier",
            parameters={"parameter_1": "value_1", "parameter_2": "value_2"},
            stream=True,
            background=False,
        )
        endpoint = f"/projects/{self.project_id}/versions/{self.version_uuid}/documents/run"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_ERROR_EVENT_STREAM),
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
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()

    async def test_fails_and_callbacks(self):
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
            background=False,
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
                "background": options.background,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, None)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()
        on_error_mock.assert_awaited_once_with(fixtures.CONVERSATION_ERROR)


# TODO(runs): TestRunPromptBackground
