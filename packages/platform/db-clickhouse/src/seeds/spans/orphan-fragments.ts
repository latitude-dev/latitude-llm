import type { SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder } from "../types.ts"
import type { SpanRow } from "./span-builders.ts"

function formatClickHouseTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "000")
}

function estimateTokens(text: string): number {
  return Math.max(12, Math.ceil(text.length / 4))
}

interface OrphanFragmentSpec {
  /** Stable key used to derive trace/span ids via `scope.traceHex` / `scope.spanHex`. */
  readonly traceKey: string
  readonly daysAgo: number
  /** Service name on the outer framework spans (HTTP server, middleware). */
  readonly frameworkServiceName: string
  /** Service name on the inner LLM span — typically the SDK's `service.name`. */
  readonly llmServiceName: string
  /** Model id surfaced on the LLM span (and so on the "real" session row). */
  readonly model: string
  readonly responseModel: string
  readonly provider: string
  /** Session id carried by the LLM span only — distinct from the trace_id. */
  readonly sessionId: string
  readonly userPrompt: string
  readonly assistantResponse: string
  readonly systemInstruction: string
  /** Name of the outer HTTP wrapper span (e.g. "POST /api/chat"). */
  readonly httpSpanName: string
  /** Name of the inner middleware span (e.g. "auth.verify"). */
  readonly middlewareSpanName: string
  /** OpenTelemetry instrumentation scope on the framework spans. */
  readonly frameworkScopeName: string
  /** OpenTelemetry instrumentation scope on the LLM span. */
  readonly llmScopeName: string
}

const ORPHAN_FRAGMENT_SPECS: readonly OrphanFragmentSpec[] = [
  {
    traceKey: "orphan-fragment-vercel-ai-next",
    daysAgo: 2,
    frameworkServiceName: "acme-chat-app",
    llmServiceName: "vercel-ai-sdk",
    model: "gpt-4o-mini",
    responseModel: "gpt-4o-mini-2024-07-18",
    provider: "openai",
    sessionId: "session-vercel-ai-demo",
    userPrompt: "Draft a release announcement for the new payments API.",
    assistantResponse:
      "Here is a draft announcement highlighting authentication, idempotency, and the migration timeline for the new payments API.",
    systemInstruction: "You are a release-notes copywriter for an internal developer-tools team.",
    httpSpanName: "POST /api/chat",
    middlewareSpanName: "next.middleware",
    frameworkScopeName: "@opentelemetry/instrumentation-undici",
    llmScopeName: "ai-sdk",
  },
  {
    traceKey: "orphan-fragment-langchain-express",
    daysAgo: 4,
    frameworkServiceName: "acme-rag-gateway",
    llmServiceName: "langchain-runtime",
    model: "gpt-4.1",
    responseModel: "gpt-4.1-2025-04-14",
    provider: "openai",
    sessionId: "session-langchain-demo",
    userPrompt: "Summarize the SLA changes proposed for the enterprise tier.",
    assistantResponse:
      "The enterprise tier raises uptime to 99.95%, expands incident response coverage to 24/7, and removes the cap on cross-region failover events.",
    systemInstruction: "You are a contracts assistant. Answer only from the retrieved context.",
    httpSpanName: "POST /v1/answer",
    middlewareSpanName: "express.middleware - cors",
    frameworkScopeName: "@opentelemetry/instrumentation-express",
    llmScopeName: "langchain-otel",
  },
  {
    traceKey: "orphan-fragment-anthropic-cloudflare",
    daysAgo: 6,
    frameworkServiceName: "acme-edge-worker",
    llmServiceName: "anthropic-sdk",
    model: "claude-sonnet-4-6",
    responseModel: "claude-sonnet-4-6-20250929",
    provider: "anthropic",
    sessionId: "session-anthropic-demo",
    userPrompt: "Explain the difference between idempotency keys and request retries.",
    assistantResponse:
      "Idempotency keys deduplicate a single user-intended operation across retries; request retries are the mechanism the client uses to deliver the same idempotent call again after a network failure.",
    systemInstruction: "You are a friendly developer-relations engineer answering API questions.",
    httpSpanName: "fetch /ask",
    middlewareSpanName: "worker.routes",
    frameworkScopeName: "@opentelemetry/instrumentation-cloudflare-workers",
    llmScopeName: "anthropic-instrumentation",
  },
]

interface BuildSpansArgs {
  readonly scope: SeedScope
  readonly spec: OrphanFragmentSpec
}

function buildOrphanFragmentTraceSpans({ scope, spec }: BuildSpansArgs): SpanRow[] {
  const traceId = scope.traceHex(spec.traceKey)
  const rootSpanId = scope.spanHex(`${spec.traceKey}-root`)
  const middlewareSpanId = scope.spanHex(`${spec.traceKey}-mw`)
  const llmSpanId = scope.spanHex(`${spec.traceKey}-llm`)

  // Outer wrapper starts at the anchor; middleware and LLM nest inside it.
  // Durations chosen so end_time of children is strictly before parent's end.
  const rootStart = scope.dateDaysAgo(spec.daysAgo, 14, 30)
  const rootDurationMs = 1850
  const middlewareStart = new Date(rootStart.getTime() + 10)
  const middlewareDurationMs = 12
  const llmStart = new Date(rootStart.getTime() + 40)
  const llmDurationMs = 1600

  const baseTags = ["orphan-fragment-demo", "otel-direct"]
  const baseMetadata: Record<string, string> = {
    seed: "orphan-fragments",
    story: spec.traceKey,
    sdk_version: "1.3.1",
  }

  const inputMessagesJson = JSON.stringify([{ role: "user", parts: [{ type: "text", content: spec.userPrompt }] }])
  const outputMessagesJson = JSON.stringify([
    { role: "assistant", parts: [{ type: "text", content: spec.assistantResponse }] },
  ])
  const systemInstructionsJson = JSON.stringify([{ type: "text", content: spec.systemInstruction }])

  const inputTokens = estimateTokens(spec.userPrompt + spec.systemInstruction)
  const outputTokens = estimateTokens(spec.assistantResponse)
  const costInputMicrocents = inputTokens * 25
  const costOutputMicrocents = outputTokens * 100

  const httpWrapper: SpanRow = {
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    // session_id="" is the critical bit: this span has no SDK session binding,
    // so the MV's coalesce falls back to trace_id and forms an orphan-fragment
    // session row alongside the real (LLM-bound) one.
    session_id: "",
    user_id: "",
    trace_id: traceId,
    span_id: rootSpanId,
    parent_span_id: "",
    api_key_id: scope.apiKeyId,
    simulation_id: "",
    start_time: formatClickHouseTimestamp(rootStart),
    end_time: formatClickHouseTimestamp(new Date(rootStart.getTime() + rootDurationMs)),
    name: spec.httpSpanName,
    service_name: spec.frameworkServiceName,
    kind: 2,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: [...baseTags],
    metadata: { ...baseMetadata, layer: "http" },
    operation: "unspecified",
    provider: "",
    model: "",
    response_model: "",
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: { "http.method": "POST", "http.route": spec.httpSpanName.split(" ")[1] ?? "/" },
    attr_int: { "http.status_code": 200 },
    attr_float: {},
    attr_bool: {},
    resource_string: { "service.name": spec.frameworkServiceName },
    scope_name: spec.frameworkScopeName,
    scope_version: "1.0.0",
  }

  const middleware: SpanRow = {
    ...httpWrapper,
    span_id: middlewareSpanId,
    parent_span_id: rootSpanId,
    start_time: formatClickHouseTimestamp(middlewareStart),
    end_time: formatClickHouseTimestamp(new Date(middlewareStart.getTime() + middlewareDurationMs)),
    name: spec.middlewareSpanName,
    kind: 1,
    metadata: { ...baseMetadata, layer: "middleware" },
    attr_string: {},
    attr_int: {},
  }

  const llm: SpanRow = {
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    // The LLM span carries the SDK's `gen_ai.conversation.id`, which lands in
    // `session_id` post-extraction. This is what produces the "real" session
    // row distinct from the orphan fragment above.
    session_id: spec.sessionId,
    user_id: "",
    trace_id: traceId,
    span_id: llmSpanId,
    parent_span_id: rootSpanId,
    api_key_id: scope.apiKeyId,
    simulation_id: "",
    start_time: formatClickHouseTimestamp(llmStart),
    end_time: formatClickHouseTimestamp(new Date(llmStart.getTime() + llmDurationMs)),
    name: `chat ${spec.model}`,
    service_name: spec.llmServiceName,
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: [...baseTags],
    metadata: { ...baseMetadata, layer: "llm" },
    operation: "chat",
    provider: spec.provider,
    model: spec.model,
    response_model: spec.responseModel,
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: costInputMicrocents,
    cost_output_microcents: costOutputMicrocents,
    cost_total_microcents: costInputMicrocents + costOutputMicrocents,
    cost_is_estimated: 0,
    time_to_first_token_ns: 250_000_000,
    is_streaming: 1,
    response_id: `resp_${spec.traceKey}`,
    finish_reasons: ["stop"],
    input_messages: inputMessagesJson,
    output_messages: outputMessagesJson,
    system_instructions: systemInstructionsJson,
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {
      "gen_ai.system": spec.provider,
      "gen_ai.request.model": spec.model,
      "gen_ai.response.model": spec.responseModel,
      "gen_ai.conversation.id": spec.sessionId,
    },
    attr_int: {
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
    },
    attr_float: { "gen_ai.request.temperature": 0.2 },
    attr_bool: {},
    resource_string: { "service.name": spec.llmServiceName },
    scope_name: spec.llmScopeName,
    scope_version: "1.0.0",
  }

  return [httpWrapper, middleware, llm]
}

function buildAllOrphanFragmentSpans(scope: SeedScope): SpanRow[] {
  return ORPHAN_FRAGMENT_SPECS.flatMap((spec) => buildOrphanFragmentTraceSpans({ scope, spec }))
}

const seedOrphanFragments: Seeder = {
  name: "spans/orphan-fragments",
  run: (ctx) =>
    Effect.gen(function* () {
      // Sentinel: the trace_id of the first deterministic mixed-binding trace.
      const sentinel = ctx.scope.traceHex(ORPHAN_FRAGMENT_SPECS[0]!.traceKey)
      const present = yield* isSentinelPresent(ctx.client, "spans", "trace_id = {sentinel:String}", { sentinel })
      if (present) {
        if (!ctx.quiet) console.log("  -> spans/orphan-fragments: already seeded, skipping")
        return
      }
      const spans = buildAllOrphanFragmentSpans(ctx.scope)
      yield* insertJsonEachRow(ctx.client, "spans", spans)
      if (!ctx.quiet) {
        console.log(
          `  -> spans/orphan-fragments: ${spans.length} spans across ${ORPHAN_FRAGMENT_SPECS.length} mixed-binding traces`,
        )
      }
    }),
}

export const orphanFragmentSeeders: readonly Seeder[] = [seedOrphanFragments]
