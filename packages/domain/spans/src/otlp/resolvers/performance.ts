import { intAttr } from "../attributes.ts"
import type { OtlpEvent, OtlpKeyValue } from "../types.ts"
import { type Candidate, fromString } from "./utils.ts"

interface ResolvedPerformance {
  readonly timeToFirstTokenNs: number
  readonly isStreaming: boolean
}

// TTFT from span attributes (some SDKs pre-compute it)
function ttftFromAttributes(spanAttrs: readonly OtlpKeyValue[]): number | undefined {
  const candidates = ["gen_ai.server.time_to_first_token", "llm.latency.time_to_first_token"]
  for (const key of candidates) {
    const v = intAttr(spanAttrs, key)
    if (v !== undefined && v > 0) return v
  }
  return undefined
}

/**
 * Extract TTFT from span events.
 *
 * GenAI semconv emits events like `gen_ai.content.completion` or `gen_ai.choice`
 * for each output chunk. The first such event's timestamp minus span start
 * gives us TTFT in nanoseconds.
 */
function ttftFromEvents(events: readonly OtlpEvent[], startTimeUnixNano: string): number | undefined {
  if (!events.length) return undefined

  const completionEventNames = new Set(["gen_ai.content.completion", "gen_ai.choice"])

  let firstChunkNano: bigint | undefined
  for (const event of events) {
    if (!event.name || !event.timeUnixNano) continue
    if (!completionEventNames.has(event.name)) continue

    const eventNano = BigInt(event.timeUnixNano)
    if (firstChunkNano === undefined || eventNano < firstChunkNano) {
      firstChunkNano = eventNano
    }
  }

  if (firstChunkNano === undefined) return undefined
  const startNano = BigInt(startTimeUnixNano || "0")
  if (startNano === 0n) return undefined

  const diff = firstChunkNano - startNano
  return diff > 0n ? Number(diff) : undefined
}

export function resolvePerformance({
  spanAttrs,
  events,
  startTimeUnixNano,
}: {
  readonly spanAttrs: readonly OtlpKeyValue[]
  readonly events: readonly OtlpEvent[]
  readonly startTimeUnixNano: string
}): ResolvedPerformance {
  const ttftAttr = ttftFromAttributes(spanAttrs)
  const ttftEvent = ttftAttr === undefined ? ttftFromEvents(events, startTimeUnixNano) : undefined
  const timeToFirstTokenNs = ttftAttr ?? ttftEvent ?? 0

  const streamingCandidates: Candidate<boolean>[] = [
    {
      resolve: (attrs) => {
        const kv = attrs.find((a) => a.key === "gen_ai.request.stream")
        if (!kv?.value) return undefined
        if (kv.value.boolValue !== undefined) return kv.value.boolValue
        if (kv.value.stringValue !== undefined) return kv.value.stringValue === "true"
        return undefined
      },
    },
    fromString("ai.settings.mode", (v) => (v === "stream" ? true : undefined)),
  ]

  let isStreaming = false
  for (const c of streamingCandidates) {
    const v = c.resolve(spanAttrs)
    if (v !== undefined) {
      isStreaming = v
      break
    }
  }

  // Heuristic: presence of completion chunk events implies streaming
  if (!isStreaming && timeToFirstTokenNs > 0) {
    isStreaming = true
  }

  return { timeToFirstTokenNs, isStreaming }
}
