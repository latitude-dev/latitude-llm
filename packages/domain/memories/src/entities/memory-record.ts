import { z } from "zod"

/**
 * A record inside a `gen_ai.memory.records` payload. Mirrors the upstream OTEL
 * companion JSON Schema (`model/gen-ai/gen-ai-memory-records.json`): `content`
 * is the only required field; `additionalProperties` is tolerated. Domain-side
 * twin of the web's `spans-tab/.../memory-records-parse.ts`.
 */
export const memoryRecordSchema = z.object({
  content: z.unknown(),
  id: z.string().nullish(),
  score: z.number().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

export type MemoryRecord = z.infer<typeof memoryRecordSchema>

const isRecordShape = (value: unknown): boolean =>
  value !== null && typeof value === "object" && !Array.isArray(value) && "content" in value

/**
 * Parse a flattened `gen_ai.memory.records` JSON string into records. Returns
 * `null` (caller degrades to the raw payload) unless it is a non-empty array
 * whose every item carries a `content` field. The attribute is `any`-typed and
 * `development`-stage, so emitters may deviate — validate, don't trust.
 */
export const parseMemoryRecords = (raw: string): readonly MemoryRecord[] | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null
  if (!parsed.every(isRecordShape)) return null
  const result = z.array(memoryRecordSchema).safeParse(parsed)
  return result.success ? result.data : null
}

/** The record's full body: the `content` field, stringified when it is an object. */
export const memoryRecordBody = (record: MemoryRecord): string =>
  typeof record.content === "string" ? record.content : JSON.stringify(record.content)
