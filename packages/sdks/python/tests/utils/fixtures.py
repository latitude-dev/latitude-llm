import json
from datetime import datetime
from typing import Any, Dict

from latitude_sdk import ApiError, ApiErrorCodes, EvaluationResult, EvaluationResultType, Log, LogSources, Prompt

ERROR_RESPONSE: Dict[str, Any] = {
    "name": "InternalServerError",
    "message": "An unexpected error occurred",
    "errorCode": "internal_server_error",
}

ERROR = ApiError(
    status=500,
    code=ApiErrorCodes.InternalServerError,
    message="Server error",
    response=json.dumps(ERROR_RESPONSE),
    db_ref=None,
)

PROMPT_RESPONSE: Dict[str, Any] = {
    "uuid": "e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    "path": "prompt",
    "content": "---\nprovider: Latitude\nmodel: gpt-4o-mini\n---\n\nHello World!",
    "config": {
        "provider": "Latitude",
        "model": "gpt-4o-mini",
    },
}

PROMPT = Prompt(
    uuid="e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    path="prompt",
    content="---\nprovider: Latitude\nmodel: gpt-4o-mini\n---\n\nHello World!",
    config={
        "provider": "Latitude",
        "model": "gpt-4o-mini",
    },
    provider=None,
)


LOG_RESPONSE: Dict[str, Any] = {
    "id": 31,
    "uuid": "935f248c-e36a-4063-a091-a5fdba6078df",
    "source": "api",
    "commitId": 21,
    "resolvedContent": "---\nprovider: Latitude\nmodel: gpt-4o-mini\n---\n\nHello World!",
    "contentHash": "c4f11a61241b0616bfb99903484fcf0e",
    "parameters": {
        "topic": "AI",
        "fluffiness": 100,
        "is_direct": False,
    },
    "customIdentifier": None,
    "duration": 2,
    "createdAt": "2025-01-01 00:00:00.000",
    "updatedAt": "2025-01-01 00:00:00.000",
}

LOG = Log(
    id=31,
    uuid="935f248c-e36a-4063-a091-a5fdba6078df",
    source=LogSources.Api,
    commit_id=21,
    resolved_content="---\nprovider: Latitude\nmodel: gpt-4o-mini\n---\n\nHello World!",
    content_hash="c4f11a61241b0616bfb99903484fcf0e",
    parameters={
        "topic": "AI",
        "fluffiness": 100,
        "is_direct": False,
    },
    custom_identifier=None,
    duration=2,
    created_at=datetime(2025, 1, 1, 0, 0, 0, 0),
    updated_at=datetime(2025, 1, 1, 0, 0, 0, 0),
)

EVALUATIONS_RESPONSE: Dict[str, Any] = {
    "evaluations": [
        "9c40e485-4275-49d3-91a5-ccda5b317eaf",
        "a58dc320-596e-41a4-8a45-8bcc28dbe4b9",
    ]
}

EVALUATIONS = [
    "9c40e485-4275-49d3-91a5-ccda5b317eaf",
    "a58dc320-596e-41a4-8a45-8bcc28dbe4b9",
]

EVALUATION_RESULT_RESPONSE: Dict[str, Any] = {
    "id": 31,
    "uuid": "e25a317b-c682-4c25-a704-a87ac79507c4",
    "evaluationId": 31,
    "documentLogId": 31,
    "evaluatedProviderLogId": 31,
    "evaluationProviderLogId": None,
    "resultableType": "evaluation_resultable_booleans",
    "resultableId": 31,
    "result": True,
    "source": "api",
    "reason": "Because Yes",
    "createdAt": "2025-01-01 00:00:00.000",
    "updatedAt": "2025-01-01 00:00:00.000",
}


EVALUATION_RESULT = EvaluationResult(
    id=31,
    uuid="e25a317b-c682-4c25-a704-a87ac79507c4",
    evaluation_id=31,
    document_log_id=31,
    evaluated_provider_log_id=31,
    evaluation_provider_log_id=None,
    resultable_type=EvaluationResultType.Boolean,
    resultable_id=31,
    result=True,
    source=LogSources.Api,
    reason="Because Yes",
    created_at=datetime(2025, 1, 1, 0, 0, 0, 0),
    updated_at=datetime(2025, 1, 1, 0, 0, 0, 0),
)
