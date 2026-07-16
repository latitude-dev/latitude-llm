export type MemoryRecord = {
  readonly content: unknown
  readonly id?: string | null
  readonly score?: number | null
  readonly metadata?: Record<string, unknown> | null
}

function isRecordShape(value: unknown): value is MemoryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "content" in value
}

/**
 * Parse the `gen_ai.memory.records` payload against the OTEL schema (array of records, each with a
 * required `content` field). Returns null when the payload is absent or off-schema, so the caller
 * falls back to rendering the raw payload in a code block.
 */
export function parseMemoryRecords(raw: string): MemoryRecord[] | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null
  if (!parsed.every(isRecordShape)) return null
  return parsed as MemoryRecord[]
}
