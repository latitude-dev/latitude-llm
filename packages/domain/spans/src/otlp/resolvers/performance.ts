/**
 * Time-to-first-token (TTFT) and streaming hints for an OTLP span.
 *
 * Instrumentations disagree on where TTFT lives:
 *
 * 1. **Span attributes** — pre-computed duration in nanoseconds (`gen_ai.server.*`, OpenInference).
 * 2. **Event attributes** — duration on the first-chunk event (`ai.response.msToFirstChunk` in ms;
 *    or `gen_ai.server.time_to_first_token` in ns on an event). No span start time required.
 * 3. **Event timestamps** — OTEL GenAI emits named chunk events; TTFT = earliest matching
 *    `timeUnixNano` minus `span.startTimeUnixNano`. Needs both clocks; fails if start is missing.
 *
 * We merge with strict precedence: (1) then (2) then (3). Zero means “unknown” downstream
 * (UI shows “Unknown” when `timeToFirstTokenNs <= 0`).
 */

import { floatAttr, intAttr } from "../attributes.ts"
import type { OtlpEvent, OtlpKeyValue } from "../types.ts"
import { type Candidate, fromString } from "./utils.ts"

interface ResolvedPerformance {
  readonly timeToFirstTokenNs: number
  readonly isStreaming: boolean
}

/** Milliseconds to nanoseconds for `ai.response.msToFirstChunk`. */
const NS_PER_MS = 1_000_000

/**
 * Event names treated as “first output chunk” for timestamp-based TTFT.
 * - `gen_ai.content.*` / `gen_ai.choice`: OTEL semantic conventions.
 * - `ai.stream.firstChunk`: Vercel AI SDK style (often paired with `ai.response.msToFirstChunk`).
 */
const ttftEventNames = new Set(["gen_ai.content.completion", "gen_ai.choice", "ai.stream.firstChunk"])

/** Span-level TTFT in nanoseconds (instrumentation already measured server-side latency). */
function ttftFromAttributes(spanAttrs: readonly OtlpKeyValue[]): number | undefined {
  const candidates = ["gen_ai.server.time_to_first_token", "llm.latency.time_to_first_token"]
  for (const key of candidates) {
    const v = intAttr(spanAttrs, key)
    if (v !== undefined && v > 0) return v
  }
  return undefined
}

/**
 * TTFT encoded on individual span **events**, not on the span root.
 *
 * Scans events in order; first positive hit wins. Handles:
 * - `gen_ai.server.time_to_first_token` on event attrs (ns, same semantics as span attr).
 * - `ai.response.msToFirstChunk` (float ms) → rounded nanoseconds.
 *
 * Unlike {@link ttftFromEventTimestamps}, this path does not need `startTimeUnixNano`.
 */
function ttftFromEventAttributes(events: readonly OtlpEvent[]): number | undefined {
  for (const event of events) {
    if (!event.attributes?.length) continue

    const ttftNs = intAttr(event.attributes, "gen_ai.server.time_to_first_token")
    if (ttftNs !== undefined && ttftNs > 0) return ttftNs

    const ttftMs = floatAttr(event.attributes, "ai.response.msToFirstChunk")
    if (ttftMs !== undefined && ttftMs > 0) {
      return Math.round(ttftMs * NS_PER_MS)
    }
  }
  return undefined
}

/**
 * TTFT from **when** the first chunk event occurred vs span start.
 *
 * Finds the minimum `timeUnixNano` among events whose `name` is in {@link ttftEventNames},
 * then returns `(firstChunkTime - span.startTimeUnixNano)` in ns when the difference is positive.
 *
 * Limitations: requires non-empty `startTimeUnixNano`; ignores event payload (no `msToFirstChunk`).
 */
function ttftFromEventTimestamps(events: readonly OtlpEvent[], startTimeUnixNano: string): number | undefined {
  if (!events.length) return undefined

  let firstChunkNano: bigint | undefined
  for (const event of events) {
    if (!event.name || !event.timeUnixNano) continue
    if (!ttftEventNames.has(event.name)) continue

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
  // TTFT: span attrs → event attrs → inferred from event timestamps. Skip later steps once set.
  const ttftAttr = ttftFromAttributes(spanAttrs)
  const ttftEventAttr = ttftAttr === undefined ? ttftFromEventAttributes(events) : undefined
  const ttftEventTimestamp =
    ttftAttr === undefined && ttftEventAttr === undefined
      ? ttftFromEventTimestamps(events, startTimeUnixNano)
      : undefined
  const timeToFirstTokenNs = ttftAttr ?? ttftEventAttr ?? ttftEventTimestamp ?? 0

  // Explicit streaming flags from span attributes (OTEL + Vercel AI).
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

  // If we derived a positive TTFT but no stream flag was set, treat the span as streaming.
  if (!isStreaming && timeToFirstTokenNs > 0) {
    isStreaming = true
  }

  return { timeToFirstTokenNs, isStreaming }
}
