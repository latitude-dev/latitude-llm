import json
from datetime import datetime
from typing import Any
from unittest import mock

from promptl_ai import (
    AssistantMessage,
    Message,
    SystemMessage,
    TextContent,
    ToolCallContent,
    ToolMessage,
    ToolResultContent,
    UserMessage,
)

from latitude_sdk import (
    AGENT_END_TOOL_NAME,
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
    ChainEventToolsRequested,
    ChainTextResponse,
    EvaluationResult,
    EvaluationResultType,
    FinishedResult,
    FinishReason,
    Log,
    LogSources,
    ModelUsage,
    ParameterType,
    Prompt,
    PromptParameter,
    Providers,
    StreamEvent,
    StreamEvents,
    ToolCall,
    ToolResult,
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

EVALUATION_RESULT_RESPONSE: dict[str, Any] = {
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

CONVERSATION_EVENTS_STREAM: list[str] = [
    f"""
event: latitude-event
data: {
        json.dumps(
            {
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
                "type": "provider-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "providerLogUuid": "456",
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
                "type": "tool-call",
                "toolCallId": "toolu_K12398312kjadbsadZ77JAS4",
                "toolName": AGENT_END_TOOL_NAME,
                "args": {"response": "I used the calculator!"},
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
                "type": "provider-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "providerLogUuid": "456",
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
                        {
                            "id": "toolu_K12398312kjadbsadZ77JAS4",
                            "name": AGENT_END_TOOL_NAME,
                            "arguments": {"response": "I used the calculator!"},
                        },
                    ],
                    "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
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
                            {
                                "toolCallId": "toolu_K12398312kjadbsadZ77JAS4",
                                "toolName": AGENT_END_TOOL_NAME,
                                "args": {"response": "I used the calculator!"},
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
                "type": "tools-requested",
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
                ],
                "tools": [
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
                    {
                        "id": "toolu_K12398312kjadbsadZ77JAS4",
                        "name": AGENT_END_TOOL_NAME,
                        "arguments": {"response": "I used the calculator!"},
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
                            {
                                "toolCallId": "toolu_K12398312kjadbsadZ77JAS4",
                                "toolName": AGENT_END_TOOL_NAME,
                                "args": {"response": "I used the calculator!"},
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
                            {
                                "toolCallId": "toolu_K12398312kjadbsadZ77JAS4",
                                "toolName": AGENT_END_TOOL_NAME,
                                "args": {"response": "I used the calculator!"},
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
        type=ChainEvents.ChainStarted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[],
    ),
    ChainEventStepStarted(
        event=StreamEvents.Latitude,
        type=ChainEvents.StepStarted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question is: Is 9.9 greater than 9.11?")]),
        ],
    ),
    ChainEventProviderStarted(
        event=StreamEvents.Latitude,
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
        "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-latest"},
        "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
    },
    {
        "event": StreamEvents.Provider,
        "type": "finish",
        "finishReason": "stop",
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-latest"},
        "usage": {"promptTokens": 31, "completionTokens": 9, "totalTokens": 40},
    },
    ChainEventProviderCompleted(
        event=StreamEvents.Latitude,
        type=ChainEvents.ProviderCompleted,
        provider_log_uuid="456",
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        token_usage=ModelUsage(prompt_tokens=31, completion_tokens=9, total_tokens=40),
        finish_reason=FinishReason.Stop,
        response=ChainTextResponse(
            text="I should look at their decimals.",
            tool_calls=[],
            usage=ModelUsage(prompt_tokens=31, completion_tokens=9, total_tokens=40),
        ),
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
        ],
    ),
    ChainEventStepCompleted(
        event=StreamEvents.Latitude,
        type=ChainEvents.StepCompleted,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
        ],
    ),
    ChainEventStepStarted(
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
        "type": "tool-call",
        "toolCallId": "toolu_K12398312kjadbsadZ77JAS4",
        "toolName": AGENT_END_TOOL_NAME,
        "args": {"response": "I used the calculator!"},
    },
    {
        "event": StreamEvents.Provider,
        "type": "step-finish",
        "finishReason": "tool-calls",
        "isContinued": False,
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:16.000Z", "modelId": "gpt-4o-mini-latest"},
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
    {
        "event": StreamEvents.Provider,
        "type": "finish",
        "finishReason": "tool-calls",
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:16.000Z", "modelId": "gpt-4o-mini-latest"},
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
    ChainEventProviderCompleted(
        event=StreamEvents.Latitude,
        type=ChainEvents.ProviderCompleted,
        provider_log_uuid="456",
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
                ToolCall(
                    id="toolu_K12398312kjadbsadZ77JAS4",
                    name=AGENT_END_TOOL_NAME,
                    arguments={"response": "I used the calculator!"},
                ),
            ],
            usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
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
                    ToolCallContent(
                        id="toolu_K12398312kjadbsadZ77JAS4",
                        name=AGENT_END_TOOL_NAME,
                        arguments={"response": "I used the calculator!"},
                    ),
                ]
            ),
        ],
    ),
    ChainEventToolsRequested(
        event=StreamEvents.Latitude,
        type=ChainEvents.ToolsRequested,
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            SystemMessage(content=[TextContent(text="Reason before answering.")]),
            UserMessage(content=[TextContent(text="My question was: Is 9.9 greater than 9.11?")]),
            AssistantMessage(content=[TextContent(text="I should look at their decimals.")]),
        ],
        tools=[
            ToolCall(id="toolu_01ARatRfRidTDshkg1UuQhW2", name="calculator", arguments={"expression": "9.9 > 9.11"}),
            ToolCall(
                id="toolu_B0398l23AOdTDshkg1UuQhZ3", name="calculator", arguments={"expression": "9.9 less than 9.11"}
            ),
            ToolCall(
                id="toolu_K12398312kjadbsadZ77JAS4",
                name=AGENT_END_TOOL_NAME,
                arguments={"response": "I used the calculator!"},
            ),
        ],
    ),
    ChainEventStepCompleted(
        event=StreamEvents.Latitude,
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
                    ToolCallContent(
                        id="toolu_K12398312kjadbsadZ77JAS4",
                        name=AGENT_END_TOOL_NAME,
                        arguments={"response": "I used the calculator!"},
                    ),
                ]
            ),
        ],
    ),
    ChainEventChainCompleted(
        event=StreamEvents.Latitude,
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
                    ToolCallContent(
                        id="toolu_K12398312kjadbsadZ77JAS4",
                        name=AGENT_END_TOOL_NAME,
                        arguments={"response": "I used the calculator!"},
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
    "tool_requests": [
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
    "conversation": [
        {"role": "system", "content": [{"type": "text", "text": "Reason before answering."}]},
        {"role": "user", "content": [{"type": "text", "text": "My question is: Is 9.9 greater than 9.11?"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "I should look at their decimals."}]},
        {"role": "system", "content": [{"type": "text", "text": "Now answer succinctly."}]},
        {"role": "user", "content": [{"type": "text", "text": "My question was: Is 9.9 greater than 9.11?"}]},
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
                {
                    "type": "tool-call",
                    "toolCallId": "toolu_K12398312kjadbsadZ77JAS4",
                    "toolName": AGENT_END_TOOL_NAME,
                    "args": {"response": "I used the calculator!"},
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
                {
                    "id": "toolu_K12398312kjadbsadZ77JAS4",
                    "name": AGENT_END_TOOL_NAME,
                    "arguments": {"response": "I used the calculator!"},
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
            {
                "id": "toolu_K12398312kjadbsadZ77JAS4",
                "name": AGENT_END_TOOL_NAME,
                "arguments": {"response": "I used the calculator!"},
            },
        ],
        "usage": {"promptTokens": 61, "completionTokens": 9, "totalTokens": 70},
    },
    "agent_response": {"response": "I used the calculator!"},
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
                ToolCallContent(
                    id="toolu_K12398312kjadbsadZ77JAS4",
                    name=AGENT_END_TOOL_NAME,
                    arguments={"response": "I used the calculator!"},
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
            ToolCall(
                id="toolu_K12398312kjadbsadZ77JAS4",
                name=AGENT_END_TOOL_NAME,
                arguments={"response": "I used the calculator!"},
            ),
        ],
        usage=ModelUsage(prompt_tokens=61, completion_tokens=9, total_tokens=70),
    ),
    tool_requests=[
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
    agent_response={"response": "I used the calculator!"},
)

CONVERSATION_TOOL_CALLS = CONVERSATION_FINISHED_RESULT.tool_requests

CONVERSATION_TOOL_RESULTS = [
    ToolResult(
        id="toolu_01ARatRfRidTDshkg1UuQhW2",
        name="calculator",
        result=True,
    ),
    ToolResult(
        id="toolu_B0398l23AOdTDshkg1UuQhZ3",
        name="calculator",
        result="Expression is invalid",
        is_error=True,
    ),
]

CONVERSATION_TOOL_RESULTS_MESSAGES: list[Message] = [
    ToolMessage(
        content=[
            ToolResultContent(
                id="toolu_01ARatRfRidTDshkg1UuQhW2",
                name="calculator",
                result=True,
            ),
        ],
    ),
    ToolMessage(
        content=[
            ToolResultContent(
                id="toolu_B0398l23AOdTDshkg1UuQhZ3",
                name="calculator",
                result="Expression is invalid",
                is_error=True,
            ),
        ],
    ),
]

FOLLOW_UP_CONVERSATION_EVENTS_STREAM: list[str] = [
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "type": "step-started",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_FINISHED_RESULT.conversation],
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_TOOL_RESULTS_MESSAGES],
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
                "type": "provider-started",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "messages": [
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_FINISHED_RESULT.conversation],
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_TOOL_RESULTS_MESSAGES],
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
                "textDelta": "Told ya!",
            }
        )
    }""",
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "step-finish",
                "finishReason": "stop",
                "isContinued": False,
                "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
                "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-latest"},
                "usage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
            }
        )
    }""",
    f"""
event: provider-event
data: {
        json.dumps(
            {
                "type": "finish",
                "finishReason": "stop",
                "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
                "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-latest"},
                "usage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
            }
        )
    }""",
    f"""
event: latitude-event
data: {
        json.dumps(
            {
                "type": "provider-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "providerLogUuid": "456",
                "tokenUsage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
                "finishReason": "stop",
                "messages": [
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_FINISHED_RESULT.conversation],
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_TOOL_RESULTS_MESSAGES],
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "Told ya!"}],
                    },
                ],
                "response": {
                    "streamType": "text",
                    "text": "Told ya!",
                    "toolCalls": [],
                    "usage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
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
                "type": "step-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "tokenUsage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
                "finishReason": "stop",
                "messages": [
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_FINISHED_RESULT.conversation],
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_TOOL_RESULTS_MESSAGES],
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "Told ya!"}],
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
                "type": "chain-completed",
                "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
                "finishReason": "stop",
                "tokenUsage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
                "messages": [
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_FINISHED_RESULT.conversation],
                    *[json.loads(message.model_dump_json()) for message in CONVERSATION_TOOL_RESULTS_MESSAGES],
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "Told ya!"}],
                    },
                ],
            },
        )
    }
""".strip(),
]

FOLLOW_UP_CONVERSATION_EVENTS: list[StreamEvent] = [
    ChainEventStepStarted(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            *CONVERSATION_FINISHED_RESULT.conversation,
            *CONVERSATION_TOOL_RESULTS_MESSAGES,
        ],
    ),
    ChainEventProviderStarted(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            *CONVERSATION_FINISHED_RESULT.conversation,
            *CONVERSATION_TOOL_RESULTS_MESSAGES,
        ],
        config={"provider": "OpenAI", "model": "gpt-4o-mini"},
    ),
    {
        "event": StreamEvents.Provider,
        "type": "text-delta",
        "textDelta": "Told ya!",
    },
    {
        "event": StreamEvents.Provider,
        "type": "step-finish",
        "finishReason": "stop",
        "isContinued": False,
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-latest"},
        "usage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
    },
    {
        "event": StreamEvents.Provider,
        "type": "finish",
        "finishReason": "stop",
        "experimental_providerMetadata": {"openai": {"reasoningTokens": 0, "cachedPromptTokens": 0}},
        "response": {"timestamp": "2025-01-02T12:29:13.000Z", "modelId": "gpt-4o-mini-latest"},
        "usage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
    },
    ChainEventProviderCompleted(
        event=StreamEvents.Latitude,
        type=ChainEvents.ProviderCompleted,
        provider_log_uuid="456",
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        token_usage=ModelUsage(prompt_tokens=77, completion_tokens=3, total_tokens=80),
        finish_reason=FinishReason.Stop,
        response=ChainTextResponse(
            text="Told ya!",
            tool_calls=[],
            usage=ModelUsage(prompt_tokens=77, completion_tokens=3, total_tokens=80),
        ),
        messages=[
            *CONVERSATION_FINISHED_RESULT.conversation,
            *CONVERSATION_TOOL_RESULTS_MESSAGES,
            AssistantMessage(content=[TextContent(text="Told ya!")]),
        ],
    ),
    ChainEventStepCompleted(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        messages=[
            *CONVERSATION_FINISHED_RESULT.conversation,
            *CONVERSATION_TOOL_RESULTS_MESSAGES,
            AssistantMessage(content=[TextContent(text="Told ya!")]),
        ],
    ),
    ChainEventChainCompleted(
        uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
        token_usage=ModelUsage(prompt_tokens=77, completion_tokens=3, total_tokens=80),
        finish_reason=FinishReason.Stop,
        messages=[
            *CONVERSATION_FINISHED_RESULT.conversation,
            *CONVERSATION_TOOL_RESULTS_MESSAGES,
            AssistantMessage(content=[TextContent(text="Told ya!")]),
        ],
    ),
]

FOLLOW_UP_CONVERSATION_FINISHED_RESULT_RESPONSE: dict[str, Any] = {
    "uuid": "bf7b0b97-6a3a-4147-b058-2588517dd209",
    "conversation": [
        *[json.loads(message.model_dump_json()) for message in CONVERSATION_FINISHED_RESULT.conversation],
        *[json.loads(message.model_dump_json()) for message in CONVERSATION_TOOL_RESULTS_MESSAGES],
        {"role": "assistant", "content": [{"type": "text", "text": "Told ya!"}]},
    ],
    "response": {
        "streamType": "text",
        "text": "Told ya!",
        "toolCalls": [],
        "usage": {"promptTokens": 77, "completionTokens": 3, "totalTokens": 80},
    },
    "tool_requests": [],
}

FOLLOW_UP_CONVERSATION_FINISHED_RESULT = FinishedResult(
    uuid="bf7b0b97-6a3a-4147-b058-2588517dd209",
    conversation=[
        *CONVERSATION_FINISHED_RESULT.conversation,
        *CONVERSATION_TOOL_RESULTS_MESSAGES,
        AssistantMessage(content=[TextContent(text="Told ya!")]),
    ],
    response=ChainTextResponse(
        text="Told ya!",
        tool_calls=[],
        usage=ModelUsage(prompt_tokens=77, completion_tokens=3, total_tokens=80),
    ),
    tool_requests=[],
)
