from typing import List, cast

import httpx

from latitude_sdk import TriggerEvaluationOptions, TriggerEvaluationResult
from tests.utils import TestCase, fixtures


class TestTriggerEvaluation(TestCase):
    async def test_success(self):
        conversation_uuid = "conversation-uuid"
        options = TriggerEvaluationOptions(evaluation_uuids=["evaluation-uuid-1", "evaluation-uuid-2"])
        endpoint = f"/conversations/{conversation_uuid}/evaluate"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.EVALUATIONS_RESPONSE)
        )

        result = await self.sdk.evaluations.trigger(conversation_uuid, options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "evaluationUuids": options.evaluation_uuids,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, TriggerEvaluationResult(evaluations=fixtures.EVALUATIONS))

    async def test_fails(self):
        conversation_uuid = "conversation-uuid"
        endpoint = f"/conversations/{conversation_uuid}/evaluate"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.evaluations.trigger(conversation_uuid)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={},
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
