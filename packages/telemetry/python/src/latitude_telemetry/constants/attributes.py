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
    # Attribution keys Latitude reads to classify a span (operation) and attribute and price it
    # (provider, model), across the conventions it ingests. Regex redaction patterns never mask them
    # (see `REDACTION_EXEMPT_ATTRIBUTES`).
    # Operation:
    operation_name = "gen_ai.operation.name"  # OTel GenAI
    openinference_span_kind = "openinference.span.kind"  # OpenInference
    llm_request_type = "llm.request.type"  # OpenLLMetry / Traceloop
    ai_operation_id = "ai.operationId"  # Vercel AI SDK
    latitude_span_kind = "latitude.span.kind"  # OpenAI Agents bridge
    span_type = "span.type"  # Claude Code
    # Provider:
    provider_name = "gen_ai.provider.name"  # OTel GenAI
    system = "gen_ai.system"  # OTel GenAI (deprecated)
    model_provider = "gen_ai.model.provider"  # Cloudflare AI Gateway
    llm_system = "llm.system"  # OpenInference
    llm_provider = "llm.provider"  # OpenInference (DSPy, LiteLLM)
    ai_model_provider = "ai.model.provider"  # Vercel AI SDK
    # Model:
    request_model = "gen_ai.request.model"  # OTel GenAI
    response_model = "gen_ai.response.model"  # OTel GenAI
    llm_model_name = "llm.model_name"  # OpenInference
    embedding_model_name = "embedding.model_name"  # OpenInference embeddings
    reranker_model_name = "reranker.model_name"  # OpenInference reranker
    ai_model_id = "ai.model.id"  # Vercel AI SDK
    ai_response_model = "ai.response.model"  # Vercel AI SDK


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
