import json
from typing import List, cast
from unittest.mock import AsyncMock

import httpx

from latitude_sdk import ChatPromptOptions, ChatPromptResult, OnToolCallDetails, StreamEvent
from tests.utils import TestCase, fixtures


class TestChatPromptSync(TestCase):
    async def test_success_without_tools(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            stream=False,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE)
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.CONVERSATION_FINISHED_RESULT)))
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
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            tools={"calculator": actual_tool_mock, "other_tool": other_tool_mock},
            stream=False,
        )
        chat_endpoint = f"/conversations/{conversation_uuid}/chat"
        chat_endpoint_mock = self.gateway_mock.post(chat_endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE)
        )
        tools_endpoint = "/tools/results"
        tools_endpoint_mock = self.gateway_mock.post(tools_endpoint).mock(return_value=httpx.Response(200))

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        chat_request, _ = chat_endpoint_mock.calls.last

        self.assert_requested(
            chat_request,
            method="POST",
            endpoint=chat_endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "tools": list((options.tools or {}).keys()),
                "stream": options.stream,
            },
        )
        self.assertEqual(chat_endpoint_mock.call_count, 1)
        self.assertEqual(tools_endpoint_mock.call_count, 0)
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.CONVERSATION_FINISHED_RESULT)))
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_awaited_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_awaited()
        actual_tool_mock.assert_not_awaited()
        other_tool_mock.assert_not_awaited()

    async def test_fails_and_retries(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            stream=False,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        requests = cast(list[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "messages": [json.loads(message.model_dump_json()) for message in messages],
                    "stream": options.stream,
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
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            stream=False,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(400, json=fixtures.CONVERSATION_ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.CONVERSATION_ERROR), fixtures.CONVERSATION_ERROR.message):
            await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()

    async def test_fails_and_callbacks(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            stream=False,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(400, json=fixtures.CONVERSATION_ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, None)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()
        on_error_mock.assert_awaited_once_with(fixtures.CONVERSATION_ERROR)


class TestChatPromptStream(TestCase):
    async def test_success_without_tools(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            stream=True,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.await_args_list])

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.CONVERSATION_FINISHED_RESULT)))
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
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            tools={"calculator": actual_tool_mock, "other_tool": other_tool_mock},
            stream=True,
        )
        chat_endpoint = f"/conversations/{conversation_uuid}/chat"
        chat_endpoint_mock = self.gateway_mock.post(chat_endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM)
        )
        tools_endpoint = "/tools/results"
        tools_endpoint_mock = self.gateway_mock.post(tools_endpoint).mock(return_value=httpx.Response(200))

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        chat_request, _ = chat_endpoint_mock.calls.last
        tools_requests = cast(list[httpx.Request], [request for request, _ in tools_endpoint_mock.calls])  # type: ignore
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.await_args_list])

        self.assert_requested(
            chat_request,
            method="POST",
            endpoint=chat_endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "tools": list((options.tools or {}).keys()),
                "stream": options.stream,
            },
        )
        self.assertEqual(chat_endpoint_mock.call_count, 1)
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
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.CONVERSATION_FINISHED_RESULT)))
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
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            stream=True,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "messages": [json.loads(message.model_dump_json()) for message in messages],
                    "stream": options.stream,
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
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            stream=True,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_ERROR_EVENT_STREAM)
        )

        with self.assertRaisesRegex(type(fixtures.CONVERSATION_ERROR), fixtures.CONVERSATION_ERROR.message):
            await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()

    async def test_fails_and_callbacks(self):
        on_event_mock = AsyncMock()
        on_finished_mock = AsyncMock()
        on_error_mock = AsyncMock()
        conversation_uuid = "conversation-uuid"
        messages = self.create_conversation(4)
        options = ChatPromptOptions(
            on_event=on_event_mock,
            on_finished=on_finished_mock,
            on_error=on_error_mock,
            stream=True,
        )
        endpoint = f"/conversations/{conversation_uuid}/chat"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=self.create_stream(200, fixtures.CONVERSATION_ERROR_EVENT_STREAM)
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, None)
        on_event_mock.assert_not_awaited()
        on_finished_mock.assert_not_awaited()
        on_error_mock.assert_awaited_once_with(fixtures.CONVERSATION_ERROR)
