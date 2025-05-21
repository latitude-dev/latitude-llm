import json
import unittest
from typing import Any, Dict, Optional
from unittest import mock

import httpx
import respx

from latitude_telemetry import GatewayOptions, InternalOptions, Telemetry, TelemetryOptions


class TestCase(unittest.TestCase):
    telemetry: Telemetry

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
        self.base_url = "https://fake-host.com/api/v2"

        self.gateway_mock = respx.MockRouter(
            assert_all_called=False,
            assert_all_mocked=True,
            base_url=self.base_url,
        )
        self.gateway_mock.start()
        self.gateway_mock.reset()
        self.gateway_mock.clear()

        self.telemetry = Telemetry(
            self.api_key,
            TelemetryOptions(
                instrumentors=[],
                disable_batch=True,
                internal=self.internal_options,
            ),
        )

    def tearDown(self):
        self.telemetry.uninstrument()
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
                {**(body or {})},
            )
        except json.JSONDecodeError:
            self.assertEqual(None, body)

    def create_instrumentation_request(self, **kwargs: Any) -> Dict[str, Any]:
        return {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": [
                            {"key": "telemetry.sdk.language", "value": {"stringValue": "python"}},
                            {"key": "telemetry.sdk.name", "value": {"stringValue": "opentelemetry"}},
                            {"key": "telemetry.sdk.version", "value": {"stringValue": "1.29.0"}},
                            {"key": "service.name", "value": {"stringValue": "latitude_telemetry.telemetry"}},
                        ]
                    },
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "traceId": mock.ANY,
                                    "spanId": mock.ANY,
                                    "name": "",
                                    "kind": mock.ANY,
                                    "startTimeUnixNano": mock.ANY,
                                    "endTimeUnixNano": mock.ANY,
                                    "status": {"code": mock.ANY},
                                    "events": [],
                                    "links": [],
                                    "attributes": [],
                                    **kwargs,
                                }
                            ]
                        }
                    ],
                }
            ]
        }
