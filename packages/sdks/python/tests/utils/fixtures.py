import json
from datetime import datetime
from typing import Any, Dict, List
from unittest import mock

from latitude_sdk import (
    ApiError,
    ApiErrorCodes,
    AssistantMessage,
    ChainError,
    ChainEventCompleted,
    ChainEventError,
    ChainEventStep,
    ChainEventStepCompleted,
    ChainTextResponse,
    EvaluationResult,
    EvaluationResultType,
    FinishedEvent,
    Log,
    LogSources,
    ModelUsage,
    Prompt,
    StreamEvent,
    StreamEvents,
    SystemMessage,
    TextContent,
    UserMessage,
)

ERROR_RESPONSE: Dict[str, Any] = {
    "name": "InternalServerError",
    "message": "An unexpected error occurred",
    "errorCode": "internal_server_error",
    "details": {},
}

ERROR = ApiError(
    status=500,
    code=ApiErrorCodes.InternalServerError,
    message="An unexpected error occurred",
    response=mock.ANY,
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

CONVERSATION_EVENTS_STREAM: List[str] = [
    f"""
event: latitude-event
data: {json.dumps({
    "type": "chain-step",
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "isLastStep": False,
    "config": {"provider": "OpenAI", "model": "gpt-4o-mini"},
    "messages": [
        {"role": "system", "content": [{"type": "text", "text": "Reason before answering."}]},
        {"role": "user", "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}]},
    ],
})}""",
    f"""
event: provider-event
data: {json.dumps({
    "type": "text-delta",
    "textDelta": "I should look",
})}""",
    f"""
event: provider-event
data: {json.dumps({
    "type": "text-delta",
    "textDelta": " at their decimals.",
})}""",
    f"""
event: provider-event
data: {json.dumps({
    "type": "step-finish",
    "finishReason": "stop",
    "isContinued": False,
    "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
    "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
    "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
})}""",
    f"""
event: provider-event
data: {json.dumps({
    "type": "finish",
    "finishReason": "stop",
    "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
    "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
    "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
})}""",
    f"""
event: latitude-event
data: {json.dumps({
    "type": "chain-step-complete",
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "response": {
        "streamType": "text",
        "text": "I should look at their decimals.",
        "toolCalls": [],
        "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
        "documentLogUuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
        "providerLog": {
            "id": 248559,
            "workspaceId": 1,
            "uuid": "4ae2e019-52ef-4595-9610-b38423c175f5",
            "documentLogUuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
            "providerId": 1,
            "model": "gpt-4o-mini",
            "finishReason": "stop",
            "config": {"provider": "OpenAI", "model": "gpt-4o-mini"},
            "messages": [
                {"role": "system", "content": [{"type": "text", "text": "Reason before answering."}]},
                {"role": "user", "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}]},
            ],
            "responseObject": None,
            "responseText": "I should look at their decimals.",
            "toolCalls": [],
            "tokens": 40,
            "costInMillicents": 9,
            "duration": 2,
            "source": "api",
            "apiKeyId": None,
            "generatedAt": "2025-01-02T12:29:16.085Z",
            "createdAt": "2025-01-02T12:29:16.086Z",
            "updatedAt": "2025-01-02T12:29:16.086Z",
        },
    },
})}""",
    f"""
event: latitude-event
data: {json.dumps({
    "type": "chain-step",
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "isLastStep": True,
    "config": {"provider": "OpenAI", "model": "gpt-4o-mini"},
    "messages": [
        {"role": "assistant", "content": [{"type": "text", "text": "I should look at their decimals."}]},
        {"role": "system", "content": [{"type": "text", "text": "Now answer succinctly."}]},
        {"role": "user", "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}]},
    ],
})}""",
    f"""
event: provider-event
data: {json.dumps({
    "type": "text-delta",
    "textDelta": "Yes, 9.9 is greater than 9.11.",
})}""",
    f"""
event: provider-event
data: {json.dumps({
    "type": "step-finish",
    "finishReason": "stop",
    "isContinued": False,
    "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
    "response": {"timestamp": "2025-01-02T12:29:16.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
    "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
})}""",
    f"""
event: provider-event
data: {json.dumps({
    "type": "finish",
    "finishReason": "stop",
    "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
    "response": {"timestamp": "2025-01-02T12:29:16.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
    "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
})}""",
    f"""
event: latitude-event
data: {json.dumps({
    "type": "chain-step-complete",
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "response": {
        "streamType": "text",
        "text": "Yes, 9.9 is greater than 9.11.",
        "toolCalls": [],
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
        "documentLogUuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
        "providerLog": {
            "id": 248560,
            "workspaceId": 1,
            "uuid": "5b7c7d44-c99b-4764-af9b-f2c4adf16b42",
            "documentLogUuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
            "providerId": 1,
            "model": "gpt-4o-mini",
            "finishReason": "stop",
            "config": {"provider": "OpenAI", "model": "gpt-4o-mini"},
            "messages": [
                {"role": "system", "content": [{"type": "text", "text": "Reason before answering."}]},
                {"role": "user", "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}]},
                {"role": "assistant", "content": [{"type": "text", "text": "I should look at their decimals."}]},
                {"role": "system", "content": [{"type": "text", "text": "Now answer succinctly."}]},
                {"role": "user", "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}]},
            ],
            "responseObject": None,
            "responseText": "Yes, 9.9 is greater than 9.11.",
            "toolCalls": [],
            "tokens": 70,
            "costInMillicents": 9,
            "duration": 2,
            "source": "api",
            "apiKeyId": None,
            "generatedAt": "2025-01-02T12:29:16.607Z",
            "createdAt": "2025-01-02T12:29:16.608Z",
            "updatedAt": "2025-01-02T12:29:16.608Z",
        },
    },
})}""",
    f"""
event: latitude-event
data: {json.dumps({
    "type": "chain-complete",
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "config": {"provider": "OpenAI", "model": "gpt-4o-mini"},
    "messages": [
        {"role": "assistant", "content": "Yes, 9.9 is greater than 9.11.", "toolCalls": []},
    ],
    "response": {
        "streamType": "text",
        "text": "Yes, 9.9 is greater than 9.11.",
        "toolCalls": [],
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
})}""",
]


CONVERSATION_EVENTS: List[StreamEvent] = [
    ChainEventStep(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        is_last_step=False,
        config={"provider": "OpenAI", "model": "gpt-4o-mini"},
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
        ],
    ),
    {
        "event": StreamEvents.Provider,
        "type": "text-delta",
        "textDelta": "I should look",
    },
    {
        "event": StreamEvents.Provider,
        "type": "text-delta",
        "textDelta": " at their decimals.",
    },
    {
        "event": StreamEvents.Provider,
        "type": "step-finish",
        "finishReason": "stop",
        "isContinued": False,
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
        "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
    },
    {
        "event": StreamEvents.Provider,
        "type": "finish",
        "finishReason": "stop",
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
        "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
    },
    ChainEventStepCompleted(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        response=ChainTextResponse(
            text="I should look at their decimals.",
            tools=[],
            usage=ModelUsage(prompt_tokens=31, completion_tokens=9, total_tokens=40),
        ),
    ),
    ChainEventStep(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        is_last_step=True,
        config={"provider": "OpenAI", "model": "gpt-4o-mini"},
        messages=[
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
        ],
    ),
    {
        "event": StreamEvents.Provider,
        "type": "text-delta",
        "textDelta": "Yes, 9.9 is greater than 9.11.",
    },
    {
        "event": StreamEvents.Provider,
        "type": "step-finish",
        "finishReason": "stop",
        "isContinued": False,
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:16.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
    {
        "event": StreamEvents.Provider,
        "type": "finish",
        "finishReason": "stop",
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:16.000Z", "modelId": "gpt-4o-mini-2024-07-18"},
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
    ChainEventStepCompleted(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        response=ChainTextResponse(
            text="Yes, 9.9 is greater than 9.11.",
            tools=[],
            usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
        ),
    ),
    ChainEventCompleted(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        config={"provider": "OpenAI", "model": "gpt-4o-mini"},
        messages=[
            AssistantMessage(content="Yes, 9.9 is greater than 9.11."),
        ],
        object=None,
        response=ChainTextResponse(
            text="Yes, 9.9 is greater than 9.11.",
            tools=[],
            usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
        ),
    ),
]

CONVERSATION_ERROR_EVENT_STREAM = [
    f"""
event: latitude-event
data: {json.dumps({
    "type": "chain-error",
    "error": {
        "name": "AIRunError",
        "message": "Cannot compile chain",
        "stack": None,
    },
})}""",
]

CONVERSATION_ERROR_EVENT = ChainEventError(
    error=ChainError(
        name="AIRunError",
        message="Cannot compile chain",
        stack=None,
    ),
)

CONVERSATION_ERROR_RESPONSE: Dict[str, Any] = {
    "name": "AIRunError",
    "message": "Cannot compile chain",
    "errorCode": "ai_run_error",
    "details": {},
}

CONVERSATION_ERROR = ApiError(
    status=400,
    code=ApiErrorCodes.AIRunError,
    message="Cannot compile chain",
    response=mock.ANY,
    db_ref=None,
)

CONVERSATION_FINISHED_EVENT_RESPONSE: Dict[str, Any] = {
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "conversation": [
        {"role": "system", "content": [{"type": "text", "text": "Reason before answering."}]},
        {"role": "user", "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "I should look at their decimals."}]},
        {"role": "system", "content": [{"type": "text", "text": "Now answer succinctly."}]},
        {"role": "user", "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}]},
        {"role": "assistant", "content": "Yes, 9.9 is greater than 9.11.", "toolCalls": []},
    ],
    "response": {
        "streamType": "text",
        "text": "Yes, 9.9 is greater than 9.11.",
        "toolCalls": [],
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
}

CONVERSATION_FINISHED_EVENT = FinishedEvent(
    uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
    conversation=[
        SystemMessage(content=[TextContent(text="Reason before answering.")]),
        UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
        AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
        SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
        UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
        AssistantMessage(content="Yes, 9.9 is greater than 9.11."),
    ],
    response=ChainTextResponse(
        text="Yes, 9.9 is greater than 9.11.",
        tools=[],
        usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
    ),
)
