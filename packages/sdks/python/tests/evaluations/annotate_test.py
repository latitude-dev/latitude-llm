from typing import List, cast

import httpx

from latitude_sdk import AnnotateEvaluationOptions, AnnotateEvaluationResult
from tests.utils import TestCase, fixtures


class TestCreateEvaluationResult(TestCase):
    async def test_success(self):
        conversation_uuid = "conversation-uuid"
        evaluation_uuid = "evaluation-uuid"
        options = AnnotateEvaluationOptions(reason="Because Yes")
        endpoint = f"/conversations/{conversation_uuid}/evaluations/{evaluation_uuid}/annotate"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.EVALUATION_RESULT_RESPONSE)
        )

        result = await self.sdk.evaluations.annotate(conversation_uuid, 1, evaluation_uuid, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "score": 1,
                "metadata": {"reason": options.reason},
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(
            result,
            AnnotateEvaluationResult(**dict(fixtures.EVALUATION_RESULT)),
        )

    async def test_fails(self):
        conversation_uuid = "conversation-uuid"
        evaluation_uuid = "evaluation-uuid"
        options = AnnotateEvaluationOptions(reason="Because Yes")
        endpoint = f"/conversations/{conversation_uuid}/evaluations/{evaluation_uuid}/annotate"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.evaluations.annotate(conversation_uuid, 1, evaluation_uuid, options)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "score": 1,
                    "metadata": {"reason": options.reason},
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
