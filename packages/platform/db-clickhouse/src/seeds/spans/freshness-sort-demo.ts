import { createHash } from "node:crypto"
import type { SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder } from "../types.ts"
import type { SpanRow } from "./span-builders.ts"

/**
 * Manual-test seed for the freshness-weighted session sort
 * (`specs/session-problems/7-freshness-weighted-sort.md`).
 *
 * Drops eight sessions into the bootstrap project, each containing the
 * unique phrase `freshmark` so a phrase-only query at
 * `/sessions?searchQuery="freshmark"` matches all of them. Half the
 * sessions are dated 30-75 days ago (the "stale" cohort), half are
 * within the last few days (the "fresh" cohort). Because phrase-only
 * matches all collapse to `best_score = 0.0`, every result lands in
 * `relevance_bucket = 0.0` and the freshness sort is the only signal —
 * the fresh cohort must appear first under the new ordering, where
 * previously the secondary sort was the meaningless `session_id DESC`.
 */

const formatClickhouseTimestamp = (date: Date): string => date.toISOString().replace("T", " ").replace("Z", "000")

interface FixtureSpec {
  readonly key: "fresh" | "stale"
  readonly indexInCohort: number
  readonly daysAgo: number
  readonly sessionLabel: string
  readonly userPrompt: string
  readonly assistantResponse: string
}

/**
 * Eight conversations all carrying the `freshmark` phrase. The cohort
 * label is part of the session id so the user can read the ordering at
 * a glance ("fresh-1 above stale-1 is correct"). Day offsets cover both
 * sides of any plausible "live vs. idle" threshold.
 */
const FIXTURES: readonly FixtureSpec[] = [
  {
    key: "fresh",
    indexInCohort: 0,
    daysAgo: 0,
    sessionLabel: "freshmark-fresh-today",
    userPrompt: "Hey, I just hit the freshmark dashboard and the throughput chart looks flat. Is the agent stuck?",
    assistantResponse:
      "Let me check the freshmark agent health metrics for today and confirm whether the throughput dip is real or a render artifact.",
  },
  {
    key: "fresh",
    indexInCohort: 1,
    daysAgo: 1,
    sessionLabel: "freshmark-fresh-yesterday",
    userPrompt: "Following up on yesterday's freshmark throughput issue — did the new worker pool roll out?",
    assistantResponse:
      "Yes, the freshmark worker pool was redeployed at 03:14 UTC and the throughput chart has been steady since.",
  },
  {
    key: "fresh",
    indexInCohort: 2,
    daysAgo: 2,
    sessionLabel: "freshmark-fresh-two-days",
    userPrompt: "Why did the freshmark queue depth spike right after the deploy?",
    assistantResponse:
      "The deploy bounced the freshmark consumer; in-flight messages were redelivered, which produced the brief queue-depth spike before drain.",
  },
  {
    key: "fresh",
    indexInCohort: 3,
    daysAgo: 3,
    sessionLabel: "freshmark-fresh-three-days",
    userPrompt: "Customer is asking about freshmark turnaround time for premium accounts. What should I tell them?",
    assistantResponse:
      "Freshmark premium SLA is currently a 4-hour p95 turnaround. I have the latest dashboard snapshot if you want to share it.",
  },
  {
    key: "stale",
    indexInCohort: 0,
    daysAgo: 30,
    sessionLabel: "freshmark-stale-30d",
    userPrompt: "Old ticket re-opened: freshmark indexing failed for org 14228. Any updates?",
    assistantResponse:
      "Looking at the freshmark indexing logs for org 14228 from a month ago — the failure was traced to a transient embedding-service timeout.",
  },
  {
    key: "stale",
    indexInCohort: 1,
    daysAgo: 45,
    sessionLabel: "freshmark-stale-45d",
    userPrompt: "Quarter-end audit: can you pull the freshmark cost breakdown for last sprint?",
    assistantResponse:
      "Pulling the freshmark cost breakdown for the audit window: compute, embedding, and storage line items attached in the next message.",
  },
  {
    key: "stale",
    indexInCohort: 2,
    daysAgo: 60,
    sessionLabel: "freshmark-stale-60d",
    userPrompt: "Doing a postmortem on the freshmark outage from two months ago. Where are the traces?",
    assistantResponse:
      "Freshmark outage traces from that window are preserved under the incident-2025-q4 tag — I can link them inline if useful.",
  },
  {
    key: "stale",
    indexInCohort: 3,
    daysAgo: 75,
    sessionLabel: "freshmark-stale-75d",
    userPrompt: "Historical question: when did we first ship the freshmark scoring pipeline?",
    assistantResponse:
      "The freshmark scoring pipeline first shipped in March; the original launch retro is in the eng-archive workspace.",
  },
] as const

const contentHashFor = (...parts: readonly string[]): string =>
  createHash("sha256").update(parts.join("\x00")).digest("hex")

const FIXTURE_KEY = "freshmark-sort-demo"

const buildFixtureSpan = (scope: SeedScope, spec: FixtureSpec): SpanRow => {
  const cohortIndex = spec.key === "fresh" ? spec.indexInCohort : spec.indexInCohort + 100
  const traceId = scope.traceHex(FIXTURE_KEY, cohortIndex)
  const spanId = scope.spanHex(FIXTURE_KEY, cohortIndex)
  // Anchor mid-morning UTC so business-hours filters don't suppress the
  // fixtures and the spread of `daysAgo` values is the only differentiator.
  const start = scope.dateDaysAgo(spec.daysAgo, 10, spec.indexInCohort)
  const durationMs = 1_400
  const end = new Date(start.getTime() + durationMs)
  const inputMessages = [{ role: "user", parts: [{ type: "text", content: spec.userPrompt }] }]
  const outputMessages = [{ role: "assistant", parts: [{ type: "text", content: spec.assistantResponse }] }]
  const inputTokens = Math.max(12, Math.ceil(spec.userPrompt.length / 4))
  const outputTokens = Math.max(12, Math.ceil(spec.assistantResponse.length / 4))

  return {
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    session_id: spec.sessionLabel,
    user_id: "",
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: "",
    api_key_id: scope.apiKeyId,
    simulation_id: "",
    start_time: formatClickhouseTimestamp(start),
    end_time: formatClickhouseTimestamp(end),
    name: "chat gpt-4.1",
    service_name: "freshmark-support-agent",
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: ["freshmark", "demo", spec.key],
    metadata: { seed: FIXTURE_KEY, cohort: spec.key },
    operation: "chat",
    provider: "openai",
    model: "gpt-4.1",
    response_model: "gpt-4.1-2025-04-14",
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: inputTokens * 25,
    cost_output_microcents: outputTokens * 100,
    cost_total_microcents: inputTokens * 25 + outputTokens * 100,
    cost_is_estimated: 1,
    time_to_first_token_ns: 180_000_000,
    is_streaming: 1,
    response_id: `seed-${spanId}`,
    finish_reasons: ["stop"],
    input_messages: JSON.stringify(inputMessages),
    output_messages: JSON.stringify(outputMessages),
    system_instructions: JSON.stringify([
      { type: "text", content: "You are a Latitude support agent helping debug freshmark pipeline issues." },
    ]),
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: { "gen_ai.request.temperature": 0 },
    attr_bool: {},
    resource_string: { "service.name": "freshmark-support-agent" },
    scope_name: "openai-instrumentation",
    scope_version: "1.0.0",
  }
}

/**
 * Lexical-search row mirroring what the `trace-search` worker would
 * normally upsert from this span's canonical conversation text. Seeding
 * it directly lets the demo work without waiting for the worker queue.
 * `search_text` is just user + assistant text joined — that's the shape
 * `buildTraceSearchDocument` produces in production (no system prompt).
 */
const buildSearchDocumentRow = (scope: SeedScope, spec: FixtureSpec, span: SpanRow) => {
  const searchText = `${spec.userPrompt}\n${spec.assistantResponse}`
  const contentHash = contentHashFor(span.trace_id, searchText)
  return {
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    trace_id: span.trace_id,
    start_time: span.start_time,
    root_span_name: span.name,
    search_text: searchText,
    content_hash: contentHash,
    indexed_at: formatClickhouseTimestamp(new Date()),
  }
}

export const freshnessSortDemoSeeder: Seeder = {
  name: "spans/freshness-sort-demo",
  run: (ctx) =>
    Effect.gen(function* () {
      // Sentinel: the first deterministic trace_id in this fixture set.
      const sentinel = ctx.scope.traceHex(FIXTURE_KEY, 0)
      const present = yield* isSentinelPresent(ctx.client, "spans", "trace_id = {sentinel:String}", { sentinel })
      if (present) {
        if (!ctx.quiet) console.log("  -> spans/freshness-sort-demo: already seeded, skipping")
        return
      }

      const spans: SpanRow[] = FIXTURES.map((spec) => buildFixtureSpan(ctx.scope, spec))
      const docs = FIXTURES.map((spec, i) => buildSearchDocumentRow(ctx.scope, spec, spans[i] as SpanRow))

      yield* insertJsonEachRow(ctx.client, "spans", spans)
      yield* insertJsonEachRow(ctx.client, "trace_search_documents", docs)

      if (!ctx.quiet) {
        console.log(
          `  -> spans/freshness-sort-demo: ${spans.length} sessions seeded (search "freshmark" to verify the freshness sort)`,
        )
      }
    }),
}
