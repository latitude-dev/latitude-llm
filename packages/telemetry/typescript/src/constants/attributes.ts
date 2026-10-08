export const ATTRIBUTES = {
  name: "latitude.capture.name",
  tags: "latitude.tags",
  metadata: "latitude.metadata",
  sessionId: "session.id",
  userId: "user.id",
  userEmail: "user.email",
  project: "latitude.project",
  // Customer-supplied LLM cost (USD). Written by `capture(..., { cost })`, `pricing`,
  // `costResolver` and `setLlmCost()`; see "Bring your own cost" in the docs.
  costInput: "gen_ai.usage.input_cost",
  costOutput: "gen_ai.usage.output_cost",
  costTotal: "gen_ai.usage.total_cost",
  /** Marker set to {@link COST_SOURCE_USER} on every span whose cost the SDK set. */
  costSource: "latitude.cost.source",
  // Attribution keys Latitude reads to classify a span (operation) and attribute and price it
  // (provider, model), across the conventions it ingests. Regex redaction patterns never mask them
  // (see `REDACTION_EXEMPT_ATTRIBUTES`).
  // Operation:
  operationName: "gen_ai.operation.name", // OTel GenAI
  openinferenceSpanKind: "openinference.span.kind", // OpenInference
  llmRequestType: "llm.request.type", // OpenLLMetry / Traceloop
  aiOperationId: "ai.operationId", // Vercel AI SDK
  latitudeSpanKind: "latitude.span.kind", // OpenAI Agents bridge
  spanType: "span.type", // Claude Code
  // Provider:
  providerName: "gen_ai.provider.name", // OTel GenAI
  system: "gen_ai.system", // OTel GenAI (deprecated)
  modelProvider: "gen_ai.model.provider", // Cloudflare AI Gateway
  llmSystem: "llm.system", // OpenInference
  llmProvider: "llm.provider", // OpenInference (DSPy, LiteLLM)
  aiModelProvider: "ai.model.provider", // Vercel AI SDK
  // Model:
  requestModel: "gen_ai.request.model", // OTel GenAI
  responseModel: "gen_ai.response.model", // OTel GenAI
  llmModelName: "llm.model_name", // OpenInference
  embeddingModelName: "embedding.model_name", // OpenInference embeddings
  rerankerModelName: "reranker.model_name", // OpenInference reranker
  aiModelId: "ai.model.id", // Vercel AI SDK
  aiResponseModel: "ai.response.model", // Vercel AI SDK
} as const

export const COST_SOURCE_USER = "user"

export const GEN_AI_MEMORY_ATTRIBUTES = {
  operationName: "gen_ai.operation.name",
  storeId: "gen_ai.memory.store.id",
  recordId: "gen_ai.memory.record.id",
  recordCount: "gen_ai.memory.record.count",
  queryText: "gen_ai.memory.query.text",
  records: "gen_ai.memory.records",
} as const

export const MEMORY_OPERATIONS = [
  "create_memory",
  "update_memory",
  "upsert_memory",
  "delete_memory",
  "search_memory",
  "create_memory_store",
  "delete_memory_store",
] as const
