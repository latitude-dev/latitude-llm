from typing import List, cast
from unittest import mock

import httpx

from latitude_telemetry import SpanPrompt
from tests.utils import TestCase


class TestSpan(TestCase):
    def test_success(self):
        endpoint = "/otlp/v1/traces"
        endpoint_mock = self.gateway_mock.post(endpoint).mock()

        with self.telemetry.span(
            name="first",
            prompt=SpanPrompt(
                uuid="prompt-uuid",
                version_uuid="version-uuid",
                parameters={"parameter": "value"},
            ),
            distinct_id="distinct-id",
            metadata={"key": "value"},
        ):
            with self.telemetry.span("second"):
                pass

        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        self.assert_requested(
            requests[0],
            method="POST",
            endpoint=endpoint,
            body=self.create_instrumentation_request(
                name="second",
                parentSpanId=mock.ANY,
                attributes=[],
            ),
        )
        self.assert_requested(
            requests[1],
            method="POST",
            endpoint=endpoint,
            body=self.create_instrumentation_request(
                name="first",
                attributes=[
                    {
                        "key": "latitude.prompt",
                        "value": {
                            "stringValue": '{"uuid":"prompt-uuid","versionUuid":"version-uuid","parameters":{"parameter":"value"}}'  # noqa: E501
                        },
                    },
                    {"key": "latitude.distinctId", "value": {"stringValue": "distinct-id"}},
                    {"key": "latitude.metadata", "value": {"stringValue": '{"key": "value"}'}},
                ],
            ),
        )
        self.assertEqual(endpoint_mock.call_count, 2)
