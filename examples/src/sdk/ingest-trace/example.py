import os
import random
import string
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from latitude_telemetry import (
    EndCompletionSpanOptions,
    EndSpanOptions,
    EndToolSpanOptions,
    LogSources,
    PromptSpanOptions,
    StartCompletionSpanOptions,
    StartToolSpanOptions,
    Telemetry,
    TelemetryOptions,
    TokenUsage,
    ToolCallInfo,
    ToolResultInfo,
)


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]
    result: Any
    started_at: datetime
    completed_at: datetime


@dataclass
class LogEntry:
    id: str
    path: str
    created_at: datetime
    completed_at: datetime
    messages: list[dict[str, str]]
    response: str
    model: str
    provider: str
    prompt_tokens: int
    completion_tokens: int
    tool_calls: list[ToolCall] = field(default_factory=list)


def random_id(length: int = 24) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


def random_date_recent(days: int = 7) -> datetime:
    now = datetime.now(timezone.utc)
    offset = timedelta(seconds=random.randint(0, days * 24 * 3600))
    return now - offset


def random_sentence() -> str:
    words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit"]
    return " ".join(random.choices(words, k=random.randint(5, 12))).capitalize() + "."


def random_paragraph() -> str:
    return " ".join(random_sentence() for _ in range(random.randint(3, 6)))


# Fake logs database - simulating historical LLM calls
FAKE_LOGS_DB: list[LogEntry] = [
    # Simple completion without tools
    LogEntry(
        id=str(uuid.uuid4()),
        path="customer-support/greeting",
        created_at=random_date_recent(days=7),
        completed_at=datetime.now(timezone.utc),
        messages=[{"role": "user", "content": random_sentence()}],
        response=random_paragraph(),
        model="gpt-4o-mini",
        provider="openai",
        prompt_tokens=random.randint(10, 100),
        completion_tokens=random.randint(20, 200),
    ),
    # Completion with tool calls (weather lookup)
    LogEntry(
        id=str(uuid.uuid4()),
        path="assistant/weather",
        created_at=random_date_recent(days=3),
        completed_at=datetime.now(timezone.utc),
        messages=[{"role": "user", "content": f"What's the weather in {random.choice(['Paris', 'London', 'Tokyo', 'New York'])}?"}],
        response=f"The current weather is {random.randint(15, 35)}°C with {random.choice(['sunny skies', 'partly cloudy', 'light rain'])}",
        model="gpt-4o",
        provider="openai",
        prompt_tokens=random.randint(50, 150),
        completion_tokens=random.randint(30, 100),
        tool_calls=[
            ToolCall(
                id=f"call_{random_id()}",
                name="get_weather",
                arguments={"location": random.choice(["Paris", "London", "Tokyo"]), "units": "celsius"},
                result={"temperature": random.randint(15, 35), "condition": random.choice(["sunny", "cloudy", "rainy"]), "humidity": random.randint(30, 90)},
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            ),
        ],
    ),
    # Completion with multiple tool calls (search + database)
    LogEntry(
        id=str(uuid.uuid4()),
        path="assistant/research",
        created_at=random_date_recent(days=1),
        completed_at=datetime.now(timezone.utc),
        messages=[{"role": "user", "content": f"Find information about Acme Corp and save it to my notes"}],
        response=random_paragraph() + " " + random_paragraph(),
        model="claude-3-5-sonnet-20241022",
        provider="anthropic",
        prompt_tokens=random.randint(100, 300),
        completion_tokens=random.randint(150, 400),
        tool_calls=[
            ToolCall(
                id=f"call_{random_id()}",
                name="web_search",
                arguments={"query": "Acme Corp", "max_results": 5},
                result={"results": [{"title": random_sentence(), "url": "https://example.com", "snippet": random_paragraph()}]},
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            ),
            ToolCall(
                id=f"call_{random_id()}",
                name="save_note",
                arguments={"title": random_sentence(), "content": random_paragraph(), "tags": ["research", "company"]},
                result={"noteId": str(uuid.uuid4()), "savedAt": datetime.now(timezone.utc).isoformat()},
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            ),
        ],
    ),
]

# Fix timestamps to have proper durations
for log in FAKE_LOGS_DB:
    base_duration = random.randint(500, 3000)
    log.completed_at = log.created_at + timedelta(milliseconds=base_duration)

    if log.tool_calls:
        tool_offset = 50
        for tool in log.tool_calls:
            tool_duration = random.randint(100, 500)
            tool.started_at = log.created_at + timedelta(milliseconds=tool_offset)
            tool.completed_at = tool.started_at + timedelta(milliseconds=tool_duration)
            tool_offset += tool_duration + 20


telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(disable_batch=True),
)


def ingest_log(log: LogEntry, project_id: int):
    duration_ms = (log.completed_at - log.created_at).total_seconds() * 1000
    print(f"\nIngesting log: {log.id}")
    print(f"  Path: {log.path}")
    print(f"  Provider: {log.provider}/{log.model}")
    print(f"  Duration: {duration_ms:.0f}ms")
    if log.tool_calls:
        print(f"  Tool calls: {', '.join(t.name for t in log.tool_calls)}")

    # Create prompt span
    prompt_span = telemetry.span.prompt(
        PromptSpanOptions(
            documentLogUuid=log.id,
            promptUuid=log.path,
            projectId=project_id,
            versionUuid="live",
            template="User message: {{message}}",
            parameters={"message": log.messages[0]["content"] if log.messages else ""},
            source=LogSources.API,
            startTime=log.created_at.timestamp(),
        )
    )

    # Create completion span
    completion_span = telemetry.span.completion(
        StartCompletionSpanOptions(
            provider=log.provider,
            model=log.model,
            input=log.messages,
            startTime=log.created_at.timestamp(),
        ),
        prompt_span.context,
    )

    # Create tool spans if present
    for tool_call in log.tool_calls:
        tool_span = telemetry.span.tool(
            StartToolSpanOptions(
                name=tool_call.name,
                call=ToolCallInfo(id=tool_call.id, arguments=tool_call.arguments),
                startTime=tool_call.started_at.timestamp(),
            ),
            completion_span.context,
        )

        tool_span.end(
            EndToolSpanOptions(
                result=ToolResultInfo(value=tool_call.result, isError=False),
                endTime=tool_call.completed_at.timestamp(),
            )
        )

    # End completion span
    completion_span.end(
        EndCompletionSpanOptions(
            output=[{"role": "assistant", "content": log.response}],
            tokens=TokenUsage(prompt=log.prompt_tokens, completion=log.completion_tokens),
            finishReason="stop",
            endTime=log.completed_at.timestamp(),
        )
    )

    # End prompt span
    prompt_span.end(
        EndSpanOptions(endTime=log.completed_at.timestamp() + 0.005)
    )


def run():
    project_id = int(os.environ["PROJECT_ID"])

    print("=" * 50)
    print("Backfilling historical logs to Latitude")
    print(f"Total logs to ingest: {len(FAKE_LOGS_DB)}")
    print("=" * 50)

    for log in FAKE_LOGS_DB:
        ingest_log(log, project_id)

    telemetry.flush()

    print("\n" + "=" * 50)
    print("All traces backfilled successfully!")
    print("=" * 50)


if __name__ == "__main__":
    run()
