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
