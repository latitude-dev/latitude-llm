import json
from typing import List, cast
from unittest import skip
from unittest.mock import Mock

import httpx

from latitude_sdk import (
    ChatPromptOptions,
    ChatPromptResult,
    StreamEvent,
)
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

    @skip(reason="TODO: on error mock assert does not match. Figure out why.")
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
