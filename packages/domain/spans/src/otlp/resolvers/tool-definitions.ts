import { anyValueToPlain } from "../any-value.ts"
import type { OtlpKeyValue } from "../types.ts"
import { attrsFromMetadata } from "./utils.ts"

const TOOL_DEFINITIONS_KEY = "gen_ai.tool.definitions"

/**
 * The tool set declared on a span, as the raw value it was recorded as.
 *
 * Left unparsed because the shape is the emitter's choice: a JSON string, or a structured AnyValue
 * when the instrumentation had a real array to hand. `toolDefinitionsFrom` normalizes either into
 * `ToolDefinition[]`, so all this answers is where the payload lives.
 */
export function resolveToolDefinitionsPayload(attrs: readonly OtlpKeyValue[]): unknown {
  const kv = attrs.find((a) => a.key === TOOL_DEFINITIONS_KEY)
  if (!kv?.value) return undefined
  if (kv.value.stringValue !== undefined) return kv.value.stringValue || undefined
  if (kv.value.arrayValue || kv.value.kvlistValue) return anyValueToPlain(kv.value)
  return undefined
}

/**
 * The tool set a source left in its metadata map rather than in a request-parameters field.
 *
 * Anything that reached the vendor over OTLP has `gen_ai.tool.definitions` there, so resolving it
 * centrally means an adapter only names its vendor-specific location, if it has one.
 */
export function resolveToolDefinitionsFromMetadata(metadata: Record<string, unknown> | null | undefined): unknown {
  return resolveToolDefinitionsPayload(attrsFromMetadata(metadata))
}
