"""
Memory-operation instrumentation — Latitude telemetry example.

Emits OpenTelemetry GenAI memory spans (create_memory / search_memory / ...) with
create_memory_telemetry, so they classify on the Spans tab and, because capture_content
is opted in here, populate the Memory page (record bodies, diffs, token deltas).

`store_id` groups everything — set it to a user id for per-user memory. Content capture
is OFF by default (OTEL Opt-In + PII); this example turns it on to show the full surface.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
"""

import os

from latitude_telemetry import Latitude, capture, create_memory_telemetry

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    disable_batch=True,
)

USER_ID = "example-user"

# Stand-in for a real memory provider (Mem0/Zep/etc.); returns the records it stored/found.
_store: dict[str, dict[str, object]] = {}


def _add(record: dict[str, object]) -> dict[str, object]:
    _store[str(record["id"])] = record
    return record


def _search(query: str) -> list[dict[str, object]]:
    return [{**r, "score": 0.9} for r in _store.values() if query in str(r["content"])]


def memory_conversation() -> list[dict[str, object]]:
    # store_id = the user id -> this user's memory is its own store.
    memory = create_memory_telemetry(latitude, store_id=USER_ID, capture_content=True)

    # Wrap form: times the write, captures errors, and records the new body.
    memory.create(
        record_id="mem_pref_drink",
        records=[{"id": "mem_pref_drink", "content": "Prefers tea over coffee"}],
        execute=lambda: _add({"id": "mem_pref_drink", "content": "Prefers tea over coffee"}),
    )

    # Search: the result maps to the records it returned (with scores) and sets the count.
    hits = memory.search(
        query="tea",
        execute=lambda: _search("tea"),
        records_from_result=lambda results: results,
    )

    # Emit form: record an operation that already happened, no wrapping.
    memory.update(
        record_id="mem_pref_drink",
        records=[{"id": "mem_pref_drink", "content": "Prefers green tea, no coffee"}],
    )

    return hits


if __name__ == "__main__":
    hits = capture(
        "memory-instrumentation",
        memory_conversation,
        {
            "tags": ["example", "memory-instrumentation-py"],
            "session_id": "memory-example-session",
            "user_id": USER_ID,
            "metadata": {"environment": "local"},
        },
    )
    print(f"Search hits: {len(hits)}")
    print("Expected spans: create_memory, search_memory, update_memory (grouped under the capture root)")

    latitude.flush()
    latitude.shutdown()
