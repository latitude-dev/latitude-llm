import {
  DestinationId,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import type { PosthogDestinationConfig } from "../entities/destination.ts"
import { mapSpansToPosthogEvents, posthogRedactionSet } from "./posthog.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const destinationId = DestinationId(cuid("d"))
const TRACE_ID = "0123456789abcdef0123456789abcdef"

const message = (role: string, content: string) => ({ role, parts: [{ type: "text" as const, content }] })

const stubSpanDetail = (overrides: Partial<SpanDetail> = {}): SpanDetail => ({
  organizationId: OrganizationId(cuid("o")),
  projectId: ProjectId(cuid("p")),
  sessionId: SessionId("session-1"),
  userId: ExternalUserId("user-1"),
  userEmail: "",
  traceId: TraceId(TRACE_ID),
  spanId: SpanId("aaaaaaaaaaaaaaaa"),
  parentSpanId: "bbbbbbbbbbbbbbbb",
  apiKeyId: "",
  simulationId: SimulationId(""),
  startTime: new Date("2026-06-01T10:00:00.000Z"),
  endTime: new Date("2026-06-01T10:00:02.500Z"),
  name: "chat gpt-4o",
  serviceName: "agent",
  kind: "client",
  statusCode: "ok",
  statusMessage: "",
  traceFlags: 0,
  traceState: "",
  errorType: "",
  tags: [],
  metadata: {},
  eventsJson: "",
  linksJson: "",
  operation: "chat",
  provider: "openai",
  model: "gpt-4o",
  responseModel: "",
  tokensInput: 120,
  tokensOutput: 45,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  costInputMicrocents: 12_345_678,
  costOutputMicrocents: 7_654_322,
  costTotalMicrocents: 20_000_000,
  costIsEstimated: false,
  timeToFirstTokenNs: 0,
  isStreaming: false,
  responseId: "",
  finishReasons: [],
  attrString: {},
  attrInt: {},
  attrFloat: {},
  attrBool: {},
  resourceString: {},
  scopeName: "",
  scopeVersion: "",
  ingestedAt: new Date("2026-06-01T10:00:03.000Z"),
  inputMessages: [message("user", "What is the weather?")],
  outputMessages: [message("assistant", "Sunny.")],
  systemInstructions: [],
  toolDefinitions: [],
  toolCallId: "",
  toolName: "",
  toolNames: [],
  toolInput: "",
  toolOutput: "",
  ...overrides,
})

const baseConfig: PosthogDestinationConfig = {
  kind: "posthog",
  host: POSTHOG_US_INGESTION_HOST,
  excludePayloads: false,
  intervalMs: 300_000,
  maxSpansPerRun: 50_000,
}

const buildSpanUrl = (span: SpanDetail) =>
  `https://app.latitude.so/projects/${span.projectId}?traceId=${span.traceId}&spanId=${span.spanId}`

const map = (
  spans: readonly SpanDetail[],
  options: { config?: Partial<PosthogDestinationConfig>; maxEventBytes?: number } = {},
) =>
  mapSpansToPosthogEvents({
    spans,
    destinationId,
    config: { ...baseConfig, ...options.config },
    buildSpanUrl,
    ...(options.maxEventBytes === undefined ? {} : { maxEventBytes: options.maxEventBytes }),
  })

describe("mapSpansToPosthogEvents", () => {
  it("maps an LLM call span to $ai_generation with tokens, USD costs, and common properties", async () => {
    const span = stubSpanDetail({
      tokensCacheRead: 10,
      tokensCacheCreate: 5,
      toolDefinitions: [{ name: "get_weather", description: "Weather lookup", parameters: {} }],
    })

    const { events, dropped } = await map([span])

    expect(dropped).toBe(0)
    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event.name).toBe("$ai_generation")
    expect(event.distinctId).toBe("user-1")
    expect(event.timestamp).toEqual(span.endTime)
    expect(event.sourceRecordId).toBe(span.spanId)
    expect(event.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(event.properties).toMatchObject({
      $ai_trace_id: TRACE_ID,
      $ai_span_id: "aaaaaaaaaaaaaaaa",
      $ai_parent_id: "bbbbbbbbbbbbbbbb",
      $ai_span_name: "chat gpt-4o",
      $ai_session_id: "session-1",
      $ai_latency: 2.5,
      $ai_provider: "openai",
      $ai_model: "gpt-4o",
      $ai_input: span.inputMessages,
      $ai_output_choices: span.outputMessages,
      $ai_input_tokens: 120,
      $ai_output_tokens: 45,
      $ai_cache_read_input_tokens: 10,
      $ai_cache_creation_input_tokens: 5,
      $ai_input_cost_usd: 0.12345678,
      $ai_output_cost_usd: 0.07654322,
      $ai_total_cost_usd: 0.2,
      $ai_tools: span.toolDefinitions,
      latitude_project_id: span.projectId,
      latitude_span_url: buildSpanUrl(span),
      latitude_source: "spans",
    })
    expect(event.properties).not.toHaveProperty("$process_person_profile")
    expect(event.properties).not.toHaveProperty("$ai_is_error")
  })

  it("maps an embedding-operation span to $ai_embedding without output choices", async () => {
    const span = stubSpanDetail({ operation: "embeddings", model: "text-embedding-3-small", outputMessages: [] })

    const { events } = await map([span])

    expect(events).toHaveLength(1)
    expect(events[0].name).toBe("$ai_embedding")
    expect(events[0].properties).toMatchObject({
      $ai_model: "text-embedding-3-small",
      $ai_input: span.inputMessages,
      $ai_input_tokens: 120,
    })
    expect(events[0].properties).not.toHaveProperty("$ai_output_choices")
  })

  it("maps a tool span to $ai_span with input/output state from the tool IO", async () => {
    const span = stubSpanDetail({
      operation: "execute_tool",
      model: "",
      provider: "",
      toolInput: '{"city":"Barcelona"}',
      toolOutput: '{"forecast":"sunny"}',
    })

    const { events } = await map([span])

    expect(events).toHaveLength(1)
    expect(events[0].name).toBe("$ai_span")
    expect(events[0].properties).toMatchObject({
      $ai_input_state: '{"city":"Barcelona"}',
      $ai_output_state: '{"forecast":"sunny"}',
    })
    expect(events[0].properties).not.toHaveProperty("$ai_provider")
    expect(events[0].properties).not.toHaveProperty("$ai_model")
  })

  it("falls back to span messages for $ai_span state when there is no tool IO", async () => {
    const span = stubSpanDetail({ operation: "chain", model: "" })

    const { events } = await map([span])

    expect(events[0].name).toBe("$ai_span")
    expect(events[0].properties).toMatchObject({
      $ai_input_state: span.inputMessages,
      $ai_output_state: span.outputMessages,
    })
  })

  it("additionally emits $ai_trace for a root span, with state from its messages", async () => {
    const span = stubSpanDetail({ parentSpanId: "" })

    const { events } = await map([span])

    expect(events.map((e) => e.name)).toEqual(["$ai_generation", "$ai_trace"])
    const [generation, trace] = events
    expect(trace.properties).toMatchObject({
      $ai_trace_id: TRACE_ID,
      $ai_session_id: "session-1",
      $ai_input_state: span.inputMessages,
      $ai_output_state: span.outputMessages,
    })
    expect(trace.properties).not.toHaveProperty("$ai_parent_id")
    expect(generation.properties).not.toHaveProperty("$ai_parent_id")
    expect(trace.uuid).not.toBe(generation.uuid)
  })

  it("maps an error span with $ai_is_error and the status message", async () => {
    const span = stubSpanDetail({
      statusCode: "error",
      statusMessage: "rate limit exceeded: prompt was 'secret'",
      errorType: "RateLimitError",
    })

    const { events } = await map([span])

    expect(events[0].properties).toMatchObject({
      $ai_is_error: true,
      $ai_error: "rate limit exceeded: prompt was 'secret'",
    })
  })

  it("uses the trace id as $ai_session_id for a session-less trace", async () => {
    const span = stubSpanDetail({ sessionId: SessionId("") })

    const { events } = await map([span])

    expect(events[0].properties.$ai_session_id).toBe(TRACE_ID)
  })

  it("falls back to the trace id as distinct_id without minting a person for anonymous spans", async () => {
    const span = stubSpanDetail({ userId: ExternalUserId("") })

    const { events } = await map([span])

    expect(events[0].distinctId).toBe(TRACE_ID)
    expect(events[0].properties.$process_person_profile).toBe(false)
  })

  it("nulls every content-bearing property and reduces $ai_error to error_type when excludePayloads is on", async () => {
    const root = stubSpanDetail({
      parentSpanId: "",
      statusCode: "error",
      statusMessage: "provider error quoting the prompt",
      errorType: "ProviderError",
      toolDefinitions: [{ name: "get_weather", description: "Weather lookup", parameters: {} }],
    })

    const { events } = await map([root], { config: { excludePayloads: true } })

    const [generation, trace] = events
    expect(generation.properties).toMatchObject({
      $ai_input: null,
      $ai_output_choices: null,
      $ai_tools: null,
      $ai_error: "ProviderError",
      $ai_is_error: true,
      $ai_model: "gpt-4o",
      $ai_input_tokens: 120,
      $ai_output_tokens: 45,
      $ai_total_cost_usd: 0.2,
      $ai_latency: 2.5,
    })
    expect(trace.properties).toMatchObject({
      $ai_input_state: null,
      $ai_output_state: null,
      $ai_error: "ProviderError",
    })
    expect(generation.properties).not.toHaveProperty("latitude_truncated")
  })

  it("derives an empty redaction set when payloads are included", () => {
    expect(posthogRedactionSet(baseConfig).size).toBe(0)
    expect(posthogRedactionSet({ ...baseConfig, excludePayloads: true }).has("$ai_input")).toBe(true)
  })

  it("truncates content of an oversized event and marks it latitude_truncated", async () => {
    const span = stubSpanDetail({ inputMessages: [message("user", "x".repeat(10_000))] })

    const { events, dropped } = await map([span], { maxEventBytes: 2_000 })

    expect(dropped).toBe(0)
    expect(events).toHaveLength(1)
    expect(events[0].properties).toMatchObject({
      $ai_input: null,
      $ai_output_choices: null,
      latitude_truncated: true,
      $ai_input_tokens: 120,
    })
  })

  it("drops an event that stays oversized after truncation and counts it", async () => {
    const oversized = stubSpanDetail({
      spanId: SpanId("cccccccccccccccc"),
      name: "x".repeat(10_000),
    })
    const fine = stubSpanDetail()

    const { events, dropped } = await map([oversized, fine], { maxEventBytes: 2_000 })

    expect(dropped).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0].sourceRecordId).toBe(fine.spanId)
  })

  it("produces identical UUIDs across re-runs and distinct UUIDs per destination", async () => {
    const span = stubSpanDetail({ parentSpanId: "" })

    const first = await map([span])
    const second = await map([span])

    expect(second.events.map((e) => e.uuid)).toEqual(first.events.map((e) => e.uuid))
    expect(new Set(first.events.map((e) => e.uuid)).size).toBe(first.events.length)

    const otherDestination = await mapSpansToPosthogEvents({
      spans: [span],
      destinationId: DestinationId(cuid("d2")),
      config: baseConfig,
      buildSpanUrl,
    })
    expect(otherDestination.events[0].uuid).not.toBe(first.events[0].uuid)
  })
})
