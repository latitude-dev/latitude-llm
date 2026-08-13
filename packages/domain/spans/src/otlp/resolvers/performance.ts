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
import { type Candidate, first, fromString } from "./utils.ts"

interface ResolvedPerformance {
  readonly timeToFirstTokenNs: number
  readonly isStreaming: boolean
}

/** Milliseconds to nanoseconds for `ai.response.msToFirstChunk`. */
const NS_PER_MS = 1_000_000

/**
 * A TTFT longer than the span that measured it, discarded.
 *
 * It cannot be real, and it is the shape a unit mix-up takes: a duration read as seconds where the
 * emitter meant milliseconds lands a thousand times too high rather than merely looking odd. Zero is
 * how an unknown TTFT is already stored, so an implausible one reads as unknown instead of as fact.
 */
function plausibleTimeToFirstToken(timeToFirstTokenNs: number, spanDurationNs: number): number {
  if (timeToFirstTokenNs <= 0) return 0
  return spanDurationNs > 0 && timeToFirstTokenNs > spanDurationNs ? 0 : timeToFirstTokenNs
}

/** A measured TTFT means tokens arrived before the call finished, which is what streaming is. */
function isStreamingFrom(reported: boolean | undefined, timeToFirstTokenNs: number): boolean {
  return reported ?? timeToFirstTokenNs > 0
}

/**
 * Event names treated as “first output chunk” for timestamp-based TTFT.
 * - `gen_ai.content.*` / `gen_ai.choice`: OTEL semantic conventions.
 * - `ai.stream.firstChunk`: Vercel AI SDK style (often paired with `ai.response.msToFirstChunk`).
 */
const ttftEventNames = new Set(["gen_ai.content.completion", "gen_ai.choice", "ai.stream.firstChunk"])

/** Span-level TTFT in nanoseconds (instrumentation already measured server-side latency). */
function ttftFromAttributes(spanAttrs: readonly OtlpKeyValue[]): number | undefined {
  const candidatesNs = ["gen_ai.server.time_to_first_token", "llm.latency.time_to_first_token"]
  for (const key of candidatesNs) {
    const v = intAttr(spanAttrs, key)
    if (v !== undefined && v > 0) return v
  }
  // Claude Code reports TTFT in milliseconds
  const ttftMs = intAttr(spanAttrs, "ttft_ms")
  if (ttftMs !== undefined && ttftMs > 0) return ttftMs * NS_PER_MS
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

const spanDurationNs = (startTimeUnixNano: string, endTimeUnixNano: string): number => {
  const start = BigInt(startTimeUnixNano || "0")
  const end = BigInt(endTimeUnixNano || "0")
  return start > 0n && end > start ? Number(end - start) : 0
}

export function resolvePerformance({
  spanAttrs,
  events,
  startTimeUnixNano,
  endTimeUnixNano,
}: {
  readonly spanAttrs: readonly OtlpKeyValue[]
  readonly events: readonly OtlpEvent[]
  readonly startTimeUnixNano: string
  readonly endTimeUnixNano: string
}): ResolvedPerformance {
  // TTFT: span attrs → event attrs → inferred from event timestamps. Skip later steps once set.
  const ttftAttr = ttftFromAttributes(spanAttrs)
  const ttftEventAttr = ttftAttr === undefined ? ttftFromEventAttributes(events) : undefined
  const ttftEventTimestamp =
    ttftAttr === undefined && ttftEventAttr === undefined
      ? ttftFromEventTimestamps(events, startTimeUnixNano)
      : undefined
  const timeToFirstTokenNs = plausibleTimeToFirstToken(
    ttftAttr ?? ttftEventAttr ?? ttftEventTimestamp ?? 0,
    spanDurationNs(startTimeUnixNano, endTimeUnixNano),
  )

  const reported = first(streamingCandidates, spanAttrs)

  return { timeToFirstTokenNs, isStreaming: isStreamingFrom(reported, timeToFirstTokenNs) }
}

/**
 * `resolvePerformance` for a span read out of a source's API, which reports TTFT as a field rather
 * than leaving it to be discovered among attributes and events.
 *
 * Sources state it two ways — a timestamp for when the first token arrived (Langfuse
 * `completionStartTime`, LangSmith `first_token_time`) or a duration already measured (Braintrust
 * `metrics.time_to_first_token`) — so both are accepted, and both answer to the same plausibility
 * check and the same streaming rule a live span does.
 */
export function resolveReportedPerformance({
  timeToFirstTokenNs,
  firstTokenAt,
  startTime,
  endTime,
  isStreaming,
}: {
  readonly timeToFirstTokenNs?: number | undefined
  readonly firstTokenAt?: Date | undefined
  readonly startTime: Date
  readonly endTime: Date
  readonly isStreaming?: boolean | undefined
}): ResolvedPerformance {
  const fromTimestamp = firstTokenAt ? (firstTokenAt.getTime() - startTime.getTime()) * NS_PER_MS : 0
  const reportedNs = timeToFirstTokenNs !== undefined && timeToFirstTokenNs > 0 ? timeToFirstTokenNs : fromTimestamp
  const resolved = plausibleTimeToFirstToken(reportedNs, (endTime.getTime() - startTime.getTime()) * NS_PER_MS)

  return { timeToFirstTokenNs: resolved, isStreaming: isStreamingFrom(isStreaming, resolved) }
}
