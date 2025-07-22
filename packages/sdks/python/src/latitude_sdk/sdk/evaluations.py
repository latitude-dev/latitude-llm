from typing import Optional

from latitude_sdk.client import (
    AnnotateEvaluationRequestBody,
    AnnotateEvaluationRequestParams,
    Client,
    RequestHandler,
)
from latitude_sdk.sdk.types import EvaluationResult, SdkOptions
from latitude_sdk.util import Model


class AnnotateEvaluationOptions(Model):
    reason: str


class AnnotateEvaluationResult(EvaluationResult, Model):
    pass


class Evaluations:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    async def annotate(
        self,
        uuid: str,
        score: int,
        evaluation_uuid: str,
        options: Optional[AnnotateEvaluationOptions] = None,
    ) -> AnnotateEvaluationResult:
        options = AnnotateEvaluationOptions(**{**dict(self._options), **dict(options or {})})

        async with self._client.request(
            handler=RequestHandler.AnnotateEvaluation,
            params=AnnotateEvaluationRequestParams(
                conversation_uuid=uuid,
                evaluation_uuid=evaluation_uuid,
            ),
            body=AnnotateEvaluationRequestBody(
                score=score,
                metadata=(AnnotateEvaluationRequestBody.Metadata(reason=options.reason) if options.reason else None),
            ),
        ) as response:
            return AnnotateEvaluationResult.model_validate_json(response.content)
