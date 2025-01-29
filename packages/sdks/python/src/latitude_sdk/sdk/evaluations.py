from typing import List, Optional, Union

from latitude_sdk.client import (
    Client,
    CreateEvaluationResultRequestBody,
    CreateEvaluationResultRequestParams,
    RequestHandler,
    TriggerEvaluationRequestBody,
    TriggerEvaluationRequestParams,
)
from latitude_sdk.sdk.types import EvaluationResult, SdkOptions
from latitude_sdk.util import Model


class TriggerEvaluationOptions(Model):
    evaluation_uuids: Optional[List[str]] = None


class TriggerEvaluationResult(Model):
    evaluations: List[str]


class CreateEvaluationResultOptions(Model):
    result: Union[str, bool, int]
    reason: str


class CreateEvaluationResultResult(EvaluationResult, Model):
    pass


class Evaluations:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    async def trigger(self, uuid: str, options: Optional[TriggerEvaluationOptions] = None) -> TriggerEvaluationResult:
        options = TriggerEvaluationOptions(**{**dict(self._options), **dict(options or {})})

        async with self._client.request(
            handler=RequestHandler.TriggerEvaluation,
            params=TriggerEvaluationRequestParams(
                conversation_uuid=uuid,
            ),
            body=TriggerEvaluationRequestBody(
                evaluation_uuids=options.evaluation_uuids,
            ),
        ) as response:
            return TriggerEvaluationResult.model_validate_json(response.content)

    async def create_result(
        self, uuid: str, evaluation_uuid: str, options: CreateEvaluationResultOptions
    ) -> CreateEvaluationResultResult:
        options = CreateEvaluationResultOptions(**{**dict(self._options), **dict(options)})

        async with self._client.request(
            handler=RequestHandler.CreateEvaluationResult,
            params=CreateEvaluationResultRequestParams(
                conversation_uuid=uuid,
                evaluation_uuid=evaluation_uuid,
            ),
            body=CreateEvaluationResultRequestBody(
                result=options.result,
                reason=options.reason,
            ),
        ) as response:
            return CreateEvaluationResultResult.model_validate_json(response.content)
