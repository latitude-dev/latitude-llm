import json
import re
from typing import List, cast
from unittest import mock
from unittest.mock import AsyncMock, Mock

import httpx

from latitude_sdk import ChatPromptOptions, ChatPromptResult, OnToolCallDetails, OnToolCallPaused, StreamEvent
from tests.utils import TestCase, fixtures


class TestChatPromptSync(TestCase):
    async def test_success_without_tools(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        on_event_mock.assert_not_called()
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_called()

    async def test_success_with_tools(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        endpoint = re.compile(r"/conversations/(?P<uuid>[a-zA-Z0-9-]+)/chat")
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            side_effect=[
                httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE),
                httpx.Response(200, json=fixtures.FOLLOW_UP_CONVERSATION_FINISHED_RESULT_RESPONSE),
            ]
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        self.assert_requested(
            requests[0],
            method="POST",
            endpoint=f"/conversations/{conversation_uuid}/chat",
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assert_requested(
            requests[1],
            method="POST",
            endpoint=f"/conversations/{fixtures.CONVERSATION_FINISHED_RESULT.uuid}/chat",
            body={
                "messages": [
                    json.loads(message.model_dump_json()) for message in fixtures.CONVERSATION_TOOL_RESULTS_MESSAGES
                ],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 2)
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.FOLLOW_UP_CONVERSATION_FINISHED_RESULT)))
        on_event_mock.assert_not_called()
        on_finished_mock.assert_called_once_with(fixtures.FOLLOW_UP_CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_called()
        [
            self.assertEqual(
                actual_tool_mock.call_args_list[index][0],
                (
                    fixtures.CONVERSATION_TOOL_CALLS[index].arguments,
                    OnToolCallDetails.model_construct(
                        id=fixtures.CONVERSATION_TOOL_CALLS[index].id,
                        name=fixtures.CONVERSATION_TOOL_CALLS[index].name,
                        conversation_uuid=fixtures.CONVERSATION_FINISHED_RESULT.uuid,
                        messages=fixtures.CONVERSATION_FINISHED_RESULT.conversation,
                        pause_execution=mock.ANY,
                        requested_tool_calls=fixtures.CONVERSATION_TOOL_CALLS,
                    ),
                ),
            )
            for index, _ in enumerate(actual_tool_mock.call_args_list)
        ]
        self.assertEqual(actual_tool_mock.await_count, len(fixtures.CONVERSATION_TOOL_CALLS))
        other_tool_mock.assert_not_awaited()

    async def test_success_with_paused_tools(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        actual_tool_mock = AsyncMock(side_effect=OnToolCallPaused)
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
        endpoint = re.compile(r"/conversations/(?P<uuid>[a-zA-Z0-9-]+)/chat")
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            side_effect=[
                httpx.Response(200, json=fixtures.CONVERSATION_FINISHED_RESULT_RESPONSE),
                httpx.Response(200, json=fixtures.FOLLOW_UP_CONVERSATION_FINISHED_RESULT_RESPONSE),
            ]
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=f"/conversations/{conversation_uuid}/chat",
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.CONVERSATION_FINISHED_RESULT)))
        on_event_mock.assert_not_called()
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_called()
        [
            self.assertEqual(
                actual_tool_mock.call_args_list[index][0],
                (
                    fixtures.CONVERSATION_TOOL_CALLS[index].arguments,
                    OnToolCallDetails.model_construct(
                        id=fixtures.CONVERSATION_TOOL_CALLS[index].id,
                        name=fixtures.CONVERSATION_TOOL_CALLS[index].name,
                        conversation_uuid=fixtures.CONVERSATION_FINISHED_RESULT.uuid,
                        messages=fixtures.CONVERSATION_FINISHED_RESULT.conversation,
                        pause_execution=mock.ANY,
                        requested_tool_calls=fixtures.CONVERSATION_TOOL_CALLS,
                    ),
                ),
            )
            for index, _ in enumerate(actual_tool_mock.call_args_list)
        ]
        self.assertEqual(actual_tool_mock.await_count, len(fixtures.CONVERSATION_TOOL_CALLS))
        other_tool_mock.assert_not_awaited()

    async def test_fails_and_retries(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.ERROR)

    async def test_fails_and_raises(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
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
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()

    async def test_fails_and_callbacks(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.CONVERSATION_ERROR)


class TestChatPromptStream(TestCase):
    async def test_success_without_tools(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.call_args_list])  # type: ignore

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
        self.assertEqual(on_event_mock.call_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_called()

    async def test_success_with_tools(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        endpoint = re.compile(r"/conversations/(?P<uuid>[a-zA-Z0-9-]+)/chat")
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            side_effect=[
                self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM),
                self.create_stream(200, fixtures.FOLLOW_UP_CONVERSATION_EVENTS_STREAM),
            ]
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.call_args_list])  # type: ignore

        self.assert_requested(
            requests[0],
            method="POST",
            endpoint=f"/conversations/{conversation_uuid}/chat",
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assert_requested(
            requests[1],
            method="POST",
            endpoint=f"/conversations/{fixtures.CONVERSATION_FINISHED_RESULT.uuid}/chat",
            body={
                "messages": [
                    json.loads(message.model_dump_json()) for message in fixtures.CONVERSATION_TOOL_RESULTS_MESSAGES
                ],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 2)
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.FOLLOW_UP_CONVERSATION_FINISHED_RESULT)))
        [
            self.assertEqual(got, exp)
            for got, exp in zip(events, fixtures.CONVERSATION_EVENTS + fixtures.FOLLOW_UP_CONVERSATION_EVENTS)
        ]
        self.assertEqual(
            on_event_mock.call_count, len(fixtures.CONVERSATION_EVENTS + fixtures.FOLLOW_UP_CONVERSATION_EVENTS)
        )
        on_finished_mock.assert_called_once_with(fixtures.FOLLOW_UP_CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_called()
        [
            self.assertEqual(
                actual_tool_mock.call_args_list[index][0],
                (
                    fixtures.CONVERSATION_TOOL_CALLS[index].arguments,
                    OnToolCallDetails.model_construct(
                        id=fixtures.CONVERSATION_TOOL_CALLS[index].id,
                        name=fixtures.CONVERSATION_TOOL_CALLS[index].name,
                        conversation_uuid=fixtures.CONVERSATION_FINISHED_RESULT.uuid,
                        messages=fixtures.CONVERSATION_FINISHED_RESULT.conversation,
                        pause_execution=mock.ANY,
                        requested_tool_calls=fixtures.CONVERSATION_TOOL_CALLS,
                    ),
                ),
            )
            for index, _ in enumerate(actual_tool_mock.call_args_list)
        ]
        self.assertEqual(actual_tool_mock.await_count, len(fixtures.CONVERSATION_TOOL_CALLS))
        other_tool_mock.assert_not_awaited()

    async def test_success_with_paused_tools(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
        actual_tool_mock = AsyncMock(side_effect=OnToolCallPaused)
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
        endpoint = re.compile(r"/conversations/(?P<uuid>[a-zA-Z0-9-]+)/chat")
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            side_effect=[
                self.create_stream(200, fixtures.CONVERSATION_EVENTS_STREAM),
                self.create_stream(200, fixtures.FOLLOW_UP_CONVERSATION_EVENTS_STREAM),
            ]
        )

        result = await self.sdk.prompts.chat(conversation_uuid, messages, options)
        request, _ = endpoint_mock.calls.last
        events = cast(List[StreamEvent], [event[0] for event, _ in on_event_mock.call_args_list])  # type: ignore

        self.assert_requested(
            request,
            method="POST",
            endpoint=f"/conversations/{conversation_uuid}/chat",
            body={
                "messages": [json.loads(message.model_dump_json()) for message in messages],
                "stream": options.stream,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, ChatPromptResult(**dict(fixtures.CONVERSATION_FINISHED_RESULT)))
        [self.assertEqual(got, exp) for got, exp in zip(events, fixtures.CONVERSATION_EVENTS)]
        self.assertEqual(on_event_mock.call_count, len(fixtures.CONVERSATION_EVENTS))
        on_finished_mock.assert_called_once_with(fixtures.CONVERSATION_FINISHED_RESULT)
        on_error_mock.assert_not_called()
        [
            self.assertEqual(
                actual_tool_mock.call_args_list[index][0],
                (
                    fixtures.CONVERSATION_TOOL_CALLS[index].arguments,
                    OnToolCallDetails.model_construct(
                        id=fixtures.CONVERSATION_TOOL_CALLS[index].id,
                        name=fixtures.CONVERSATION_TOOL_CALLS[index].name,
                        conversation_uuid=fixtures.CONVERSATION_FINISHED_RESULT.uuid,
                        messages=fixtures.CONVERSATION_FINISHED_RESULT.conversation,
                        pause_execution=mock.ANY,
                        requested_tool_calls=fixtures.CONVERSATION_TOOL_CALLS,
                    ),
                ),
            )
            for index, _ in enumerate(actual_tool_mock.call_args_list)
        ]
        self.assertEqual(actual_tool_mock.await_count, len(fixtures.CONVERSATION_TOOL_CALLS))
        other_tool_mock.assert_not_awaited()

    async def test_fails_and_retries(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.ERROR)

    async def test_fails_and_raises(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
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
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()

    async def test_fails_and_callbacks(self):
        on_event_mock = Mock()
        on_finished_mock = Mock()
        on_error_mock = Mock()
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
        on_event_mock.assert_not_called()
        on_finished_mock.assert_not_called()
        on_error_mock.assert_called_once_with(fixtures.CONVERSATION_ERROR)
