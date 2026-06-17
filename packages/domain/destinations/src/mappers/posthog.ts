import type { DestinationId } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { Effect } from "effect"
import { DESTINATION_EVENT_UUID_NAMESPACE, DESTINATION_MAX_EVENT_BYTES_DEFAULT } from "../constants.ts"
import type { DestinationEvent } from "../entities/destination-event.ts"
import type { DestinationSourceConfig, SpansSourceConfig } from "../entities/destination-source.ts"
import { uuidV5 } from "../helpers.ts"
import type { DestinationMapper } from "../ports/destination-mapper.ts"

const MICROCENTS_PER_USD = 100_000_000
const MS_PER_SECOND = 1_000

export const POSTHOG_EVENT_NAMES = ["$ai_generation", "$ai_embedding", "$ai_span", "$ai_trace"] as const
export type PosthogEventName = (typeof POSTHOG_EVENT_NAMES)[number]

/** Content-bearing properties: nulled by payload exclusion and truncation; `$ai_error` is replaced by the span's `error_type` instead. */
export const POSTHOG_CONTENT_PROPERTIES = [
  "$ai_input",
  "$ai_output_choices",
  "$ai_input_state",
  "$ai_output_state",
  "$ai_tools",
  "$ai_error",
] as const

const CONTENT_PROPERTY_SET: ReadonlySet<string> = new Set(POSTHOG_CONTENT_PROPERTIES)

/** Property names to exclude for this source config; per-field granularity later is a config-only change here. */
export const posthogExcludedProperties = (config: SpansSourceConfig): ReadonlySet<string> =>
  config.excludePayloads ? CONTENT_PROPERTY_SET : new Set()

export interface MapSpansToPosthogEventsInput {
  readonly spans: readonly SpanDetail[]
  readonly destinationId: DestinationId
  readonly sourceConfig: SpansSourceConfig
  /** Pure URL builder for `latitude_span_url`; the caller owns app host + routing. */
  readonly buildSpanUrl: (span: SpanDetail) => string
  /** Per-event size limit owned by the engine/adapter; defaults to {@link DESTINATION_MAX_EVENT_BYTES_DEFAULT}. */
  readonly maxEventBytes?: number
}

export interface MapSpansToPosthogEventsResult {
  readonly events: readonly DestinationEvent[]
  /** Events dropped by the oversized-event policy, recorded as `events_dropped` on the sync run. */
  readonly dropped: number
}

const eventNameForSpan = (span: SpanDetail): PosthogEventName => {
  if (span.operation === "embeddings") return "$ai_embedding"
  if (span.model !== "") return "$ai_generation"
  return "$ai_span"
}

const microcentsToUsd = (microcents: number): number => microcents / MICROCENTS_PER_USD

const commonProperties = (span: SpanDetail, input: MapSpansToPosthogEventsInput): Record<string, unknown> => ({
  $ai_trace_id: span.traceId,
  $ai_span_id: span.spanId,
  ...(span.parentSpanId === "" ? {} : { $ai_parent_id: span.parentSpanId }),
  $ai_span_name: span.name,
  $ai_session_id: span.sessionId === "" ? span.traceId : span.sessionId,
  $ai_latency: (span.endTime.getTime() - span.startTime.getTime()) / MS_PER_SECOND,
  ...(span.provider === "" ? {} : { $ai_provider: span.provider }),
  ...(span.userId === "" ? { $process_person_profile: false } : {}),
  latitude_project_id: span.projectId,
  latitude_source: "spans",
  latitude_span_url: input.buildSpanUrl(span),
})

const errorProperties = (span: SpanDetail): Record<string, unknown> => {
  if (span.statusCode !== "error") return {}
  const message = span.statusMessage === "" ? span.errorType : span.statusMessage
  return { $ai_is_error: true, ...(message === "" ? {} : { $ai_error: message }) }
}

const costProperties = (span: SpanDetail): Record<string, unknown> => ({
  ...(span.costInputMicrocents > 0 ? { $ai_input_cost_usd: microcentsToUsd(span.costInputMicrocents) } : {}),
  ...(span.costOutputMicrocents > 0 ? { $ai_output_cost_usd: microcentsToUsd(span.costOutputMicrocents) } : {}),
  ...(span.costTotalMicrocents > 0 ? { $ai_total_cost_usd: microcentsToUsd(span.costTotalMicrocents) } : {}),
})

const generationProperties = (span: SpanDetail): Record<string, unknown> => ({
  $ai_model: span.model,
  $ai_input: span.inputMessages,
  $ai_output_choices: span.outputMessages,
  $ai_input_tokens: span.tokensInput,
  $ai_output_tokens: span.tokensOutput,
  ...(span.tokensCacheRead > 0 ? { $ai_cache_read_input_tokens: span.tokensCacheRead } : {}),
  ...(span.tokensCacheCreate > 0 ? { $ai_cache_creation_input_tokens: span.tokensCacheCreate } : {}),
  ...costProperties(span),
  ...(span.toolDefinitions.length > 0 ? { $ai_tools: span.toolDefinitions } : {}),
})

const embeddingProperties = (span: SpanDetail): Record<string, unknown> => ({
  // Embeddings are classified by operation, not model, so model can be empty — omit rather than emit `$ai_model: ""`.
  ...(span.model === "" ? {} : { $ai_model: span.model }),
  $ai_input: span.inputMessages,
  $ai_input_tokens: span.tokensInput,
  ...costProperties(span),
})

const spanStateProperties = (span: SpanDetail): Record<string, unknown> => {
  const inputState = span.toolInput === "" ? span.inputMessages : span.toolInput
  const outputState = span.toolOutput === "" ? span.outputMessages : span.toolOutput
  return { $ai_input_state: inputState, $ai_output_state: outputState }
}

const typedProperties = (name: PosthogEventName, span: SpanDetail): Record<string, unknown> => {
  switch (name) {
    case "$ai_generation":
      return generationProperties(span)
    case "$ai_embedding":
      return embeddingProperties(span)
    case "$ai_span":
      return spanStateProperties(span)
    case "$ai_trace":
      return { $ai_input_state: span.inputMessages, $ai_output_state: span.outputMessages }
  }
}

interface DraftEvent {
  readonly name: PosthogEventName
  readonly properties: Record<string, unknown>
}

const draftsForSpan = (span: SpanDetail, input: MapSpansToPosthogEventsInput): DraftEvent[] => {
  const name = eventNameForSpan(span)
  const common = { ...commonProperties(span, input), ...errorProperties(span) }
  const drafts: DraftEvent[] = [{ name, properties: { ...common, ...typedProperties(name, span) } }]
  if (span.parentSpanId === "") {
    drafts.push({ name: "$ai_trace", properties: { ...common, ...typedProperties("$ai_trace", span) } })
  }
  return drafts
}

const stripContentProperties = (params: {
  readonly properties: Record<string, unknown>
  readonly errorType: string
  readonly names: ReadonlySet<string>
}): Record<string, unknown> => {
  if (params.names.size === 0) return params.properties
  const next = { ...params.properties }
  for (const name of params.names) {
    if (!(name in next)) continue
    next[name] = name === "$ai_error" && params.errorType !== "" ? params.errorType : null
  }
  return next
}

const textEncoder = new TextEncoder()

const eventByteSize = (event: DestinationEvent): number => textEncoder.encode(JSON.stringify(event)).length

const applyOversizedPolicy = (params: {
  readonly event: DestinationEvent
  readonly errorType: string
  readonly maxEventBytes: number
}): DestinationEvent | null => {
  if (eventByteSize(params.event) <= params.maxEventBytes) return params.event
  const truncated: DestinationEvent = {
    ...params.event,
    properties: {
      ...stripContentProperties({
        properties: params.event.properties,
        errorType: params.errorType,
        names: CONTENT_PROPERTY_SET,
      }),
      latitude_truncated: true,
    },
  }
  return eventByteSize(truncated) <= params.maxEventBytes ? truncated : null
}

export const mapSpansToPosthogEvents = async (
  input: MapSpansToPosthogEventsInput,
): Promise<MapSpansToPosthogEventsResult> => {
  // Guard against a non-positive/NaN limit, which would treat every event as oversized and drop everything.
  const maxEventBytes =
    Number.isFinite(input.maxEventBytes) && (input.maxEventBytes as number) > 0
      ? (input.maxEventBytes as number)
      : DESTINATION_MAX_EVENT_BYTES_DEFAULT
  const excludedProperties = posthogExcludedProperties(input.sourceConfig)
  const events: DestinationEvent[] = []
  let dropped = 0

  for (const span of input.spans) {
    const distinctId = span.userId === "" ? span.traceId : span.userId
    for (const draft of draftsForSpan(span, input)) {
      const event: DestinationEvent = {
        uuid: await uuidV5({
          namespace: DESTINATION_EVENT_UUID_NAMESPACE,
          name: `${input.destinationId}:${span.spanId}:${draft.name}`,
        }),
        name: draft.name,
        distinctId,
        timestamp: span.endTime,
        sourceRecordId: span.spanId,
        properties: stripContentProperties({
          properties: draft.properties,
          errorType: span.errorType,
          names: excludedProperties,
        }),
      }
      const deliverable = applyOversizedPolicy({ event, errorType: span.errorType, maxEventBytes })
      if (deliverable === null) {
        dropped += 1
        continue
      }
      events.push(deliverable)
    }
  }

  return { events, dropped }
}

/**
 * Binds {@link mapSpansToPosthogEvents} to the {@link DestinationMapper} port.
 * `buildSpanUrl` (app host + routing) and `maxEventBytes` (the adapter's live
 * vendor cap) are injected at the wiring boundary, keeping the mapper pure.
 */
export const createPosthogMapper = (params: {
  readonly buildSpanUrl: (span: SpanDetail) => string
  readonly maxEventBytes?: number
}): DestinationMapper<SpanDetail> => ({
  toEvents: (spans, destinationId, sourceConfig: DestinationSourceConfig) =>
    Effect.promise(() =>
      mapSpansToPosthogEvents({
        spans,
        destinationId,
        sourceConfig: sourceConfig as SpansSourceConfig,
        buildSpanUrl: params.buildSpanUrl,
        ...(params.maxEventBytes === undefined ? {} : { maxEventBytes: params.maxEventBytes }),
      }),
    ),
})
