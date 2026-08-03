export const ATTRIBUTES = {
  name: "latitude.capture.name",
  tags: "latitude.tags",
  metadata: "latitude.metadata",
  sessionId: "session.id",
  userId: "user.id",
  userEmail: "user.email",
  project: "latitude.project",
} as const

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
