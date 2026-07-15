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

export function isMemoryOperation(operation: string): boolean {
  return MEMORY_OPERATION_SET.has(operation)
}
