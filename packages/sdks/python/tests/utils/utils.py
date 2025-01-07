import json
from typing import Any, Dict, List, Optional
from unittest import IsolatedAsyncioTestCase

import httpx
import respx

from latitude_sdk import (
    AssistantMessage,
    FileContent,
    GatewayOptions,
    ImageContent,
    InternalOptions,
    Latitude,
    LatitudeOptions,
    LogSources,
    Message,
    SystemMessage,
    TextContent,
    ToolCallContent,
    ToolMessage,
    ToolResultContent,
    UserMessage,
)


class TestCase(IsolatedAsyncioTestCase):
    sdk: Latitude

    def setUp(self):
        self.maxDiff = None

        self.internal_options = InternalOptions(
            gateway=GatewayOptions(
                host="fake-host.com",
                port=443,
                ssl=True,
                api_version="v2",
            ),
            retries=3,
            delay=0,
            timeout=0.5,
        )
        self.api_key = "fake-api-key"
        self.project_id = 31
        self.version_uuid = "fake-version-uuid"
        self.base_url = "https://fake-host.com/api/v2"

        self.gateway_mock = respx.MockRouter(
            assert_all_called=False,
            assert_all_mocked=True,
            base_url=self.base_url,
        )
        self.gateway_mock.start()
        self.gateway_mock.reset()
        self.gateway_mock.clear()

        self.sdk = Latitude(
            self.api_key,
            LatitudeOptions(
                project_id=self.project_id,
                version_uuid=self.version_uuid,
                internal=self.internal_options,
            ),
        )

    def tearDown(self):
        self.gateway_mock.stop()

    def assert_requested(
        self,
        request: httpx.Request,
        method: str,
        endpoint: str,
        headers: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ):
        self.assertEqual(request.method, method)
        self.assertEqual(request.url, f"{self.base_url}{endpoint}")
        self.assertDictContainsSubset(
            {**{"authorization": f"Bearer {self.api_key}"}, **(headers or {})},
            dict(request.headers),
        )
        try:
            self.assertEqual(
                json.loads(request.content),
                {**{"__internal": {"source": LogSources.Api}}, **(body or {})},
            )
        except json.JSONDecodeError:
            self.assertEqual(None, body)

    def create_conversation(self, messages: int) -> List[Message]:
        conversation = [
            SystemMessage(content="system message"),
            UserMessage(
                content=[
                    TextContent(text="user message 1"),
                    TextContent(text="user message 2"),
                    ImageContent(image="user image"),
                    FileContent(file="user file", mime_type="mime type"),
                ],
            ),
            AssistantMessage(
                content=[
                    TextContent(text="assistant message"),
                    ToolCallContent(
                        id="tool id",
                        name="tool name",
                        arguments={"argument_1": "value 1", "argument_2": "value 2"},
                    ),
                ],
            ),
            ToolMessage(
                content=[
                    ToolResultContent(
                        id="tool id",
                        name="tool name",
                        result="tool result",
                        is_error=False,
                    ),
                ],
            ),
        ]

        return (conversation * messages)[:messages]

    def create_stream(self, status: int, events: List[str]) -> httpx.Response:
        stream = ""
        for event in events:
            stream += event + "\n\n"

        return httpx.Response(
            status_code=status,
            headers={"Content-Type": "text/event-stream"},
            stream=httpx.ByteStream(stream.encode("utf-8")),
        )
