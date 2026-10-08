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
