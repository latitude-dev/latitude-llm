import type { Operation } from "@domain/spans"

const MEMORY_OPERATIONS = [
  "create_memory",
  "update_memory",
  "upsert_memory",
  "delete_memory",
  "search_memory",
  "create_memory_store",
  "delete_memory_store",
] as const satisfies readonly Operation[]

const MEMORY_OPERATION_SET: ReadonlySet<string> = new Set(MEMORY_OPERATIONS)

const MEMORY_MUTATING_OPERATIONS = [
  "create_memory",
  "update_memory",
  "upsert_memory",
  "delete_memory",
] as const satisfies readonly Operation[]

const MEMORY_MUTATING_OPERATION_SET: ReadonlySet<string> = new Set(MEMORY_MUTATING_OPERATIONS)

export function isMemoryOperation(operation: string): boolean {
  return MEMORY_OPERATION_SET.has(operation)
}

/** Memory ops that change a record's body — the ones whose span detail shows a diff. */
export function isMutatingMemoryOperation(operation: string): boolean {
  return MEMORY_MUTATING_OPERATION_SET.has(operation)
}
