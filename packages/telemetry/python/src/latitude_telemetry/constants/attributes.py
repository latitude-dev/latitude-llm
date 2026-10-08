"""
Attribute keys for trace-wide context set via capture().
"""


class ATTRIBUTES:
    name = "latitude.capture.name"
    tags = "latitude.tags"
    metadata = "latitude.metadata"
    session_id = "session.id"
    user_id = "user.id"
    user_email = "user.email"
    project = "latitude.project"
    # Customer-supplied LLM cost (USD). Written by `capture(cost=...)`, `pricing`,
    # `cost_resolver` and `set_llm_cost()`; see "Bring your own cost" in the docs.
    cost_input = "gen_ai.usage.input_cost"
    cost_output = "gen_ai.usage.output_cost"
    cost_total = "gen_ai.usage.total_cost"
    # Marker set to `COST_SOURCE_USER` on every span whose cost the SDK set.
    cost_source = "latitude.cost.source"


COST_SOURCE_USER = "user"


class MEMORY_ATTRIBUTES:
    operation_name = "gen_ai.operation.name"
    store_id = "gen_ai.memory.store.id"
    record_id = "gen_ai.memory.record.id"
    record_count = "gen_ai.memory.record.count"
    query_text = "gen_ai.memory.query.text"
    records = "gen_ai.memory.records"


MEMORY_OPERATIONS = (
    "create_memory",
    "update_memory",
    "upsert_memory",
    "delete_memory",
    "search_memory",
    "create_memory_store",
    "delete_memory_store",
)
