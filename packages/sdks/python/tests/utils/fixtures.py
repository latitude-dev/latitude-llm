import json
from datetime import datetime
from typing import Any
from unittest import mock

from promptl_ai import (
    AssistantMessage,
    SystemMessage,
    TextContent,
    ToolCallContent,
    UserMessage,
)

from latitude_sdk import (
    ApiError,
    ApiErrorCodes,
    ChainError,
    ChainEventChainCompleted,
    ChainEventChainError,
    ChainEventChainStarted,
    ChainEventProviderCompleted,
    ChainEventProviderStarted,
    ChainEvents,
    ChainEventStepCompleted,
    ChainEventStepStarted,
    ChainTextResponse,
    DeletePromptResult,
    EvaluationResult,
    FinishedResult,
    FinishReason,
    Log,
    LogSources,
    ModelUsage,
    ParameterType,
    Project,
    Prompt,
    PromptParameter,
    Providers,
    StreamEvent,
    StreamEvents,
    ToolCall,
    ToolResult,
    Version,
)

ERROR_RESPONSE: dict[str, Any] = {
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

CLIENT_ERROR_RESPONSE: dict[str, Any] = {
    "name": "BadRequestError",
    "message": "A client error occurred",
    "errorCode": "bad_request_error",
    "details": {},
}

CLIENT_ERROR = ApiError(
    status=400,
    code=ApiErrorCodes.BadRequestError,
    message="A client error occurred",
    response=mock.ANY,
    db_ref=None,
)

NOT_FOUND_ERROR_RESPONSE: dict[str, Any] = {
    "name": "NotFoundError",
    "message": "Project ID is required",
    "errorCode": "not_found_error",
    "details": {},
}


NOT_FOUND_ERROR = ApiError(
    status=404,
    code=ApiErrorCodes.NotFoundError,
    message="Project ID is required",
    response=mock.ANY,
    db_ref=None,
)


PROMPT_RESPONSE: dict[str, Any] = {
    "uuid": "e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    "path": "prompt",
    "content": """
---
provider: OpenAI
model: gpt-4o-mini
temperature: 0.5
maxTokens: 1024
topP: 0.9
---

<step>
    You are a helpful assistant.
    <user>{{ question }}</user>
</step>
<step>
    Now say bye.
</step>
""".strip(),
    "config": {
        "provider": "OpenAI",
        "model": "gpt-4o-mini",
        "temperature": 0.5,
        "maxTokens": 1024,
        "topP": 0.9,
    },
    "provider": "openai",
    "parameters": {"question": {"type": "text"}},
}

PROMPT = Prompt(
    uuid="e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    path="prompt",
    content="""
---
provider: OpenAI
model: gpt-4o-mini
temperature: 0.5
maxTokens: 1024
topP: 0.9
---

<step>
    You are a helpful assistant.
    <user>{{ question }}</user>
</step>
<step>
    Now say bye.
</step>
""".strip(),
    config={
        "provider": "OpenAI",
        "model": "gpt-4o-mini",
        "temperature": 0.5,
        "maxTokens": 1024,
        "topP": 0.9,
    },
    provider=Providers.OpenAI,
    parameters={"question": PromptParameter(type=ParameterType.Text)},
)

LOG_RESPONSE: dict[str, Any] = {
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

EVALUATIONS_RESPONSE: dict[str, Any] = {
    "evaluations": [
        "9c40e485-4275-49d3-91a5-ccda5b317eaf",
        "a58dc320-596e-41a4-8a45-8bcc28dbe4b9",
    ]
}

EVALUATIONS = [
    "9c40e485-4275-49d3-91a5-ccda5b317eaf",
    "a58dc320-596e-41a4-8a45-8bcc28dbe4b9",
]

PROJECT_RESPONSE: dict[str, Any] = {
    "id": 1,
    "uuid": "project-uuid-123",
    "name": "Test Project",
    "createdAt": "2025-01-01 00:00:00.000",
    "updatedAt": "2025-01-01 00:00:00.000",
}

PROJECT = Project(
    id=1,
    uuid="project-uuid-123",
    name="Test Project",
    created_at=datetime(2025, 1, 1, 0, 0, 0, 0),
    updated_at=datetime(2025, 1, 1, 0, 0, 0, 0),
)

VERSION_RESPONSE: dict[str, Any] = {
    "id": 1,
    "uuid": "version-uuid-456",
    "title": "Version 1",
    "description": "Version 1 description",
    "projectId": 1,
    "createdAt": "2025-01-01 00:00:00.000",
    "updatedAt": "2025-01-01 00:00:00.000",
    "mergedAt": "2025-01-01 00:00:00.000",
}

VERSION = Version(
    id=1,
    uuid="version-uuid-456",
    title="Version 1",
    description="Version 1 description",
    project_id=1,
    created_at=datetime(2025, 1, 1, 0, 0, 0, 0),
    updated_at=datetime(2025, 1, 1, 0, 0, 0, 0),
    merged_at=datetime(2025, 1, 1, 0, 0, 0, 0),
)

CREATE_PROJECT_RESPONSE: dict[str, Any] = {
    "project": PROJECT_RESPONSE,
    "version": VERSION_RESPONSE,
}

PROJECTS_RESPONSE: list[dict[str, Any]] = [
    PROJECT_RESPONSE,
    {
        "id": 2,
        "uuid": "project-uuid-789",
        "name": "Another Test Project",
        "createdAt": "2025-01-01 01:00:00.000",
        "updatedAt": "2025-01-01 01:00:00.000",
    },
]

PROJECTS = [
    PROJECT,
    Project(
        id=2,
        uuid="project-uuid-789",
        name="Another Test Project",
        created_at=datetime(2025, 1, 1, 1, 0, 0, 0),
        updated_at=datetime(2025, 1, 1, 1, 0, 0, 0),
    ),
]

EVALUATION_RESULT_RESPONSE: dict[str, Any] = {
    "uuid": "e25a317b-c682-4c25-a704-a87ac79507c4",
    "score": 1,
    "normalizedScore": 1,
    "metadata": {"reason": "Because Yes"},
    "hasPassed": True,
    "createdAt": "2025-01-01 00:00:00.000",
    "updatedAt": "2025-01-01 00:00:00.000",
    "versionUuid": "e25a317b-c682-4c25-a704-a87ac79507c4",
    "error": None,
}

EVALUATION_RESULT = EvaluationResult(
    uuid="e25a317b-c682-4c25-a704-a87ac79507c4",
    score=1,
    normalized_score=1,
    metadata={"reason": "Because Yes"},
    has_passed=True,
    created_at=datetime(2025, 1, 1, 0, 0, 0, 0),
    updated_at=datetime(2025, 1, 1, 0, 0, 0, 0),
    version_uuid="e25a317b-c682-4c25-a704-a87ac79507c4",
    error=None,
)

CONVERSATION_EVENTS_STREAM: list[str] = [
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "chain-started",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [],
            },
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "step-started",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
                    },
                ],
            },
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "provider-started",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
                    },
                ],
                "config": {"provider": "OpenAI", "model": "gpt-4o-mini"},
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "text-delta",
                "textDelta": "I should look",
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "text-delta",
                "textDelta": " at their decimals.",
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "step-finish",
                "finishReason": "stop",
                "isContinued": False,
                "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
                "response": {
                    "timestamp": "2025-01-02T12:29:13.000Z",
                    "modelId": "gpt-4o-mini-latest",
                },
                "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "finish",
                "finishReason": "stop",
                "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
                "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-latest"},
                "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
            },
            ensure_ascii=False,
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "provider-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "tokenUsage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
                "finishReason": "stop",
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I should look at their decimals."}],
                    },
                ],
                "response": {
                    "streamType": "text",
                    "text": "I should look at their decimals.",
                    "toolCalls": [],
                    "usage": {
                        "promptTokens": 31,
                        "completionTokens": 9,
                        "totalTokens": 40,
                    },
                    "model": "gpt-4o-mini",
                    "provider": "openai",
                    "cost": 0.001,
                    "input": [
                        {
                            "role": "system",
                            "content": [{"type": "text", "text": "Reason before answering."}],
                        },
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                        },
                        {
                            "role": "assistant",
                            "content": [{"type": "text", "text": "I should look at their decimals."}],
                        },
                    ],
                },
            },
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "step-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "tokenUsage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
                "finishReason": "stop",
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I should look at their decimals."}],
                    },
                ],
            },
            ensure_ascii=False,
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "step-started",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I should look at their decimals."}],
                    },
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Now answer succinctly."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                ],
            },
            ensure_ascii=False,
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "provider-started",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "tokenUsage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
                "finishReason": "stop",
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I should look at their decimals."}],
                    },
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Now answer succinctly."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                ],
                "config": {
                    "provider": "OpenAI",
                    "model": "gpt-4o-mini",
                    "tools": {
                        "calculator": {
                            "description": "Calculates an expression.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "expression": {
                                        "type": "string",
                                        "description": "The expression to calculate, e.g., '1 + 1'.",
                                    }
                                },
                                "required": ["expression"],
                                "additionalProperties": False,
                            },
                        },
                    },
                },
            },
            ensure_ascii=False,
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "text-delta",
                "textDelta": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "tool-call",
                "toolCallId": "toolu_01ARatRfRidTDshkg1UuQhW2",
                "toolName": "calculator",
                "args": {"expression": "9.9 > 9.11"},
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "tool-call",
                "toolCallId": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                "toolName": "calculator",
                "args": {"expression": "9.9 less than 9.11"},
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "step-finish",
                "finishReason": "tool-calls",
                "isContinued": False,
                "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
                "response": {
                    "timestamp": "2025-01-02T12:29:16.000Z",
                    "modelId": "gpt-4o-mini-latest",
                },
                "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
            },
        )
    }
""".strip(),
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "finish",
                "finishReason": "tool-calls",
                "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
                "response": {
                    "timestamp": "2025-01-02T12:29:16.000Z",
                    "modelId": "gpt-4o-mini-latest",
                },
                "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
            },
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "provider-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "finishReason": "stop",
                "tokenUsage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
                "response": {
                    "streamType": "text",
                    "text": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
                    "toolCalls": [
                        {
                            "id": "toolu_01ARatRfRidTDshkg1UuQhW2",
                            "name": "calculator",
                            "arguments": {"expression": "9.9 > 9.11"},
                        },
                        {
                            "id": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                            "name": "calculator",
                            "arguments": {"expression": "9.9 less than 9.11"},
                        },
                    ],
                    "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
                    "model": "gpt-4o-mini",
                    "provider": "openai",
                    "cost": 0.002,
                    "input": [
                        {
                            "role": "system",
                            "content": [{"type": "text", "text": "Reason before answering."}],
                        },
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
                        },
                        {
                            "role": "assistant",
                            "content": [{"type": "text", "text": "I should look at their decimals."}],
                        },
                        {
                            "role": "system",
                            "content": [{"type": "text", "text": "Now answer succinctly."}],
                        },
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                        },
                    ],
                },
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I should look at their decimals."}],
                    },
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Now answer succinctly."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "text",
                                "text": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
                            },
                            {
                                "toolCallId": "toolu_01ARatRfRidTDshkg1UuQhW2",
                                "toolName": "calculator",
                                "args": {"expression": "9.9 > 9.11"},
                            },
                            {
                                "toolCallId": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                                "toolName": "calculator",
                                "args": {"expression": "9.9 less than 9.11"},
                            },
                        ],
                    },
                ],
            },
        )
    }
""".strip(),
    # NOTE: At this time tool calls are executed
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "step-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I should look at their decimals."}],
                    },
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Now answer succinctly."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "text",
                                "text": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
                            },
                            {
                                "toolCallId": "toolu_01ARatRfRidTDshkg1UuQhW2",
                                "toolName": "calculator",
                                "args": {"expression": "9.9 > 9.11"},
                            },
                            {
                                "toolCallId": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                                "toolName": "calculator",
                                "args": {"expression": "9.9 less than 9.11"},
                            },
                        ],
                    },
                ],
            },
        )
    }
""".strip(),
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "type": "chain-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "finishReason": "tool-calls",
                "tokenUsage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
                "messages": [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Reason before answering."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I should look at their decimals."}],
                    },
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "Now answer succinctly."}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
                    },
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "text",
                                "text": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
                            },
                            {
                                "toolCallId": "toolu_01ARatRfRidTDshkg1UuQhW2",
                                "toolName": "calculator",
                                "args": {"expression": "9.9 > 9.11"},
                            },
                            {
                                "toolCallId": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                                "toolName": "calculator",
                                "args": {"expression": "9.9 less than 9.11"},
                            },
                        ],
                    },
                ],
            },
        )
    }
""".strip(),
]

CONVERSATION_EVENTS: list[StreamEvent] = [
    ChainEventChainStarted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.ChainStarted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[],
    ),
    ChainEventStepStarted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.StepStarted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
        ],
    ),
    ChainEventProviderStarted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.ProviderStarted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
        ],
        config={"provider": "OpenAI", "model": "gpt-4o-mini"},
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
        "response": {
            "timestamp": "2025-01-02T12:29:13.000Z",
            "modelId": "gpt-4o-mini-latest",
        },
        "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
    },
    {
        "event": StreamEvents.Provider,
        "type": "finish",
        "finishReason": "stop",
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {
            "timestamp": "2025-01-02T12:29:13.000Z",
            "modelId": "gpt-4o-mini-latest",
        },
        "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
    },
    ChainEventProviderCompleted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.ProviderCompleted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        token_usage=ModelUsage(prompt_tokens=31, completion_tokens=9, total_tokens=40),
        finish_reason=FinishReason.Stop,
        response=ChainTextResponse(
            text="I should look at their decimals.",
            tool_calls=[],
            usage=ModelUsage(prompt_tokens=31, completion_tokens=9, total_tokens=40),
            model="gpt-4o-mini",
            provider=Providers.OpenAI,
            cost=0.001,
            input=[
                SystemMessage(content=[TextContent(text="Reason before answering.")]),
                UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
                AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            ],
        ),
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
        ],
    ),
    ChainEventStepCompleted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.StepCompleted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
        ],
    ),
    ChainEventStepStarted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.StepStarted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
        ],
    ),
    ChainEventProviderStarted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.ProviderStarted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
        ],
        config={
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "tools": {
                "calculator": {
                    "description": "Calculates an expression.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "expression": {
                                "type": "string",
                                "description": "The expression to calculate, e.g., '1 + 1'.",
                            }
                        },
                        "required": ["expression"],
                        "additionalProperties": False,
                    },
                },
            },
        },
    ),
    {
        "event": StreamEvents.Provider,
        "type": "text-delta",
        "textDelta": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
    },
    {
        "event": StreamEvents.Provider,
        "type": "tool-call",
        "toolCallId": "toolu_01ARatRfRidTDshkg1UuQhW2",
        "toolName": "calculator",
        "args": {"expression": "9.9 > 9.11"},
    },
    {
        "event": StreamEvents.Provider,
        "type": "tool-call",
        "toolCallId": "toolu_B0398l23AOdTDshkg1UuQhZ3",
        "toolName": "calculator",
        "args": {"expression": "9.9 less than 9.11"},
    },
    {
        "event": StreamEvents.Provider,
        "type": "step-finish",
        "finishReason": "tool-calls",
        "isContinued": False,
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {
            "timestamp": "2025-01-02T12:29:16.000Z",
            "modelId": "gpt-4o-mini-latest",
        },
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
    {
        "event": StreamEvents.Provider,
        "type": "finish",
        "finishReason": "tool-calls",
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {
            "timestamp": "2025-01-02T12:29:16.000Z",
            "modelId": "gpt-4o-mini-latest",
        },
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
    ChainEventProviderCompleted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.ProviderCompleted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        token_usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
        finish_reason=FinishReason.Stop,
        response=ChainTextResponse(
            text="Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
            tool_calls=[
                ToolCall(
                    id="toolu_01ARatRfRidTDshkg1UuQhW2",
                    name="calculator",
                    arguments={"expression": "9.9 > 9.11"},
                ),
                ToolCall(
                    id="toolu_B0398l23AOdTDshkg1UuQhZ3",
                    name="calculator",
                    arguments={"expression": "9.9 less than 9.11"},
                ),
            ],
            usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
            model="gpt-4o-mini",
            provider=Providers.OpenAI,
            cost=0.002,
            input=[
                SystemMessage(content=[TextContent(text="Reason before answering.")]),
                UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
                AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
                SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
                UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            ],
        ),
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(
                content=[
                    TextContent(text="Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me."),
                    ToolCallContent(
                        id="toolu_01ARatRfRidTDshkg1UuQhW2",
                        name="calculator",
                        arguments={"expression": "9.9 > 9.11"},
                    ),
                    ToolCallContent(
                        id="toolu_B0398l23AOdTDshkg1UuQhZ3",
                        name="calculator",
                        arguments={"expression": "9.9 less than 9.11"},
                    ),
                ]
            ),
        ],
    ),
    # NOTE: At this time tool calls are executed
    ChainEventStepCompleted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.StepCompleted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(
                content=[
                    TextContent(text="Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me."),
                    ToolCallContent(
                        id="toolu_01ARatRfRidTDshkg1UuQhW2",
                        name="calculator",
                        arguments={"expression": "9.9 > 9.11"},
                    ),
                    ToolCallContent(
                        id="toolu_B0398l23AOdTDshkg1UuQhZ3",
                        name="calculator",
                        arguments={"expression": "9.9 less than 9.11"},
                    ),
                ]
            ),
        ],
    ),
    ChainEventChainCompleted(
        event=StreamEvents.Latitude,
        timestamp=965044800000,
        type=ChainEvents.ChainCompleted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(
                content=[
                    TextContent(text="Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me."),
                    ToolCallContent(
                        id="toolu_01ARatRfRidTDshkg1UuQhW2",
                        name="calculator",
                        arguments={"expression": "9.9 > 9.11"},
                    ),
                    ToolCallContent(
                        id="toolu_B0398l23AOdTDshkg1UuQhZ3",
                        name="calculator",
                        arguments={"expression": "9.9 less than 9.11"},
                    ),
                ]
            ),
        ],
        token_usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
        finish_reason=FinishReason.ToolCalls,
    ),
]

CONVERSATION_ERROR_EVENT_STREAM = [
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "timestamp": 965044800000,
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [],
                "type": "chain-error",
                "error": {
                    "name": "AIRunError",
                    "message": "Cannot compile chain",
                    "stack": None,
                },
            }
        )
    }""",
]

CONVERSATION_ERROR_EVENT = ChainEventChainError(
    event=StreamEvents.Latitude,
    timestamp=965044800000,
    type=ChainEvents.ChainError,
    error=ChainError(
        name="AIRunError",
        message="Cannot compile chain",
        stack=None,
    ),
    uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
    messages=[],
)

CONVERSATION_ERROR_RESPONSE: dict[str, Any] = {
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

CONVERSATION_FINISHED_RESULT_RESPONSE: dict[str, Any] = {
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "conversation": [
        {
            "role": "system",
            "content": [{"type": "text", "text": "Reason before answering."}],
        },
        {
            "role": "user",
            "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
        },
        {
            "role": "assistant",
            "content": [{"type": "text", "text": "I should look at their decimals."}],
        },
        {
            "role": "system",
            "content": [{"type": "text", "text": "Now answer succinctly."}],
        },
        {
            "role": "user",
            "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
        },
        {
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
                },
                {
                    "type": "tool-call",
                    "toolCallId": "toolu_01ARatRfRidTDshkg1UuQhW2",
                    "toolName": "calculator",
                    "args": {"expression": "9.9 > 9.11"},
                },
                {
                    "type": "tool-call",
                    "toolCallId": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                    "toolName": "calculator",
                    "args": {"expression": "9.9 less than 9.11"},
                },
            ],
            "toolCalls": [
                {
                    "id": "toolu_01ARatRfRidTDshkg1UuQhW2",
                    "name": "calculator",
                    "arguments": {"expression": "9.9 > 9.11"},
                },
                {
                    "id": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                    "name": "calculator",
                    "arguments": {"expression": "9.9 less than 9.11"},
                },
            ],
        },
    ],
    "response": {
        "streamType": "text",
        "text": "Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
        "toolCalls": [
            {
                "id": "toolu_01ARatRfRidTDshkg1UuQhW2",
                "name": "calculator",
                "arguments": {"expression": "9.9 > 9.11"},
            },
            {
                "id": "toolu_B0398l23AOdTDshkg1UuQhZ3",
                "name": "calculator",
                "arguments": {"expression": "9.9 less than 9.11"},
            },
        ],
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
        "model": "gpt-4o-mini",
        "provider": "openai",
        "cost": 0.002,
        "input": [
            {
                "role": "system",
                "content": [{"type": "text", "text": "Reason before answering."}],
            },
            {
                "role": "user",
                "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}],
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": "I should look at their decimals."}],
            },
            {
                "role": "system",
                "content": [{"type": "text", "text": "Now answer succinctly."}],
            },
            {
                "role": "user",
                "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}],
            },
        ],
    },
}

CONVERSATION_FINISHED_RESULT = FinishedResult(
    uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
    conversation=[
        SystemMessage(content=[TextContent(text="Reason before answering.")]),
        UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
        AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
        SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
        UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
        AssistantMessage(
            content=[
                TextContent(
                    text="Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
                ),
                ToolCallContent(
                    id="toolu_01ARatRfRidTDshkg1UuQhW2",
                    name="calculator",
                    arguments={"expression": "9.9 > 9.11"},
                ),
                ToolCallContent(
                    id="toolu_B0398l23AOdTDshkg1UuQhZ3",
                    name="calculator",
                    arguments={"expression": "9.9 less than 9.11"},
                ),
            ]
        ),
    ],
    response=ChainTextResponse(
        text="Yes, 9.9 is greater than 9.11. Use the calculator if you don't believe me.",
        tool_calls=[
            ToolCall(
                id="toolu_01ARatRfRidTDshkg1UuQhW2",
                name="calculator",
                arguments={"expression": "9.9 > 9.11"},
            ),
            ToolCall(
                id="toolu_B0398l23AOdTDshkg1UuQhZ3",
                name="calculator",
                arguments={"expression": "9.9 less than 9.11"},
            ),
        ],
        usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
        model="gpt-4o-mini",
        provider=Providers.OpenAI,
        cost=0.002,
        input=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
            SystemMessage(content=[TextContent(text="Now answer succinctly.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
        ],
    ),
)

CONVERSATION_TOOL_CALLS = [
    ToolCall(
        id="toolu_01ARatRfRidTDshkg1UuQhW2",
        name="calculator",
        arguments={"expression": "9.9 > 9.11"},
    ),
    ToolCall(
        id="toolu_B0398l23AOdTDshkg1UuQhZ3",
        name="calculator",
        arguments={"expression": "9.9 less than 9.11"},
    ),
]

CONVERSATION_TOOL_RESULTS = [
    ToolResult(
        id="toolu_01ARatRfRidTDshkg1UuQhW2",
        name="calculator",
        result=True,
        is_error=False,
    ),
    ToolResult(
        id="toolu_B0398l23AOdTDshkg1UuQhZ3",
        name="calculator",
        result="Expression is invalid",
        is_error=True,
    ),
]

DELETE_PROMPT_RESPONSE: dict[str, Any] = {
    "documentUuid": "e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    "path": "prompt-path",
}

DELETE_PROMPT_RESULT = DeletePromptResult(
    document_uuid="e01a1035-6ed3-4edc-88e6-c0748ea300c7",
    path="prompt-path",
)
