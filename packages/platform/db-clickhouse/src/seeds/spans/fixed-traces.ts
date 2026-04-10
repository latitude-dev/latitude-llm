import {
  ALL_ANNOTATION_TRACE_DAYS_AGO,
  ALL_ANNOTATION_TRACES,
  COMBINATION_DATASET_ROWS,
  type DatasetRow,
  ISSUE_2_ADDITIONAL_NEGATIVES,
  SEED_ALIGNMENT_FIXTURE_SPAN_IDS,
  SEED_ALIGNMENT_FIXTURE_TRACE_IDS,
  SEED_ANNOTATION_SPAN_IDS,
  SEED_ANNOTATION_TRACE_IDS,
  SEED_API_KEY_ID,
  SEED_COMBINATION_SIMULATION_SPAN_IDS,
  SEED_COMBINATION_SIMULATION_TRACE_IDS,
  SEED_LIFECYCLE_SPAN_IDS,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_SIMULATION_ID,
  SEED_WARRANTY_SIMULATION_ID,
  SEED_WARRANTY_SIMULATION_SPAN_IDS,
  SEED_WARRANTY_SIMULATION_TRACE_IDS,
  WARRANTY_DATASET_ROWS,
  seedDateDaysAgo,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"
import type { SpanRow } from "./span-builders.ts"

const SUPPORT_AGENT_SYSTEM_PROMPT =
  "You are Acme Assist, the customer support AI for Acme Corporation. Help customers with orders, returns, product information, and technical support. Always refer to Acme's warranty policy, which covers manufacturing defects but explicitly excludes misuse involving roadrunners, cliffs, or violations of the laws of physics. Be friendly and professional. At Acme, satisfaction is guaranteed. (Guarantee does not constitute a legally binding promise.)"

function toMessageJson(role: "user" | "assistant", content: string): string {
  return JSON.stringify([{ role, parts: [{ type: "text", content }] }])
}

function toSystemJson(content: string): string {
  return JSON.stringify([{ type: "text", content }])
}

function createFixedSpan(opts: {
  traceId: string
  spanId: string
  startTime: string
  endTime: string
  userPrompt: string
  assistantResponse: string
  systemInstruction: string
  serviceName: string
  tags: string[]
  simulationId?: string
  metadata?: Record<string, string>
}): SpanRow {
  return {
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    user_id: "",
    trace_id: opts.traceId,
    span_id: opts.spanId,
    parent_span_id: "",
    api_key_id: SEED_API_KEY_ID,
    simulation_id: opts.simulationId ?? "",
    start_time: opts.startTime,
    end_time: opts.endTime,
    name: "chat gpt-4o",
    service_name: opts.serviceName,
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: opts.tags,
    metadata: {
      environment: opts.simulationId ? "simulation" : "production",
      seed: opts.simulationId ? "fixed-simulation-traces" : "fixed-traces",
      ...opts.metadata,
    },
    operation: "chat",
    provider: "openai",
    model: "gpt-4o",
    response_model: "gpt-4o-2024-08-06",
    tokens_input: 64,
    tokens_output: 48,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 1600,
    cost_output_microcents: 4800,
    cost_total_microcents: 6400,
    cost_is_estimated: 1,
    time_to_first_token_ns: 180_000_000,
    is_streaming: 0,
    response_id: `seed-${opts.spanId}`,
    finish_reasons: ["stop"],
    input_messages: toMessageJson("user", opts.userPrompt),
    output_messages: toMessageJson("assistant", opts.assistantResponse),
    system_instructions: toSystemJson(opts.systemInstruction),
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: { "service.name": opts.serviceName },
    scope_name: "openai-instrumentation",
    scope_version: "1.0.0",
  }
}

function formatClickHouseTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "000")
}

function generateTime(daysAgo: number, hour: number, minute = 0): { start: string; end: string } {
  const start = seedDateDaysAgo(daysAgo, hour, minute)
  const end = new Date(start.getTime() + 4000)
  return { start: formatClickHouseTimestamp(start), end: formatClickHouseTimestamp(end) }
}

function requiredAt<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`Missing seeded item at index ${index}`)
  }
  return item
}

function buildAnnotationTraceSpans(): SpanRow[] {
  return ALL_ANNOTATION_TRACES.map((trace, i) => {
    const daysAgo = ALL_ANNOTATION_TRACE_DAYS_AGO[i]
    if (daysAgo === undefined) {
      throw new Error(`Missing seeded annotation trace day at index ${i}`)
    }
    const time = generateTime(daysAgo, 9 + (i % 4))
    return createFixedSpan({
      traceId: requiredAt(SEED_ANNOTATION_TRACE_IDS, i),
      spanId: requiredAt(SEED_ANNOTATION_SPAN_IDS, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: trace.userMessage,
      assistantResponse: trace.agentResponse,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "annotation"],
      metadata: { story: "issue-annotation-corpus" },
    })
  })
}

function buildAlignmentFixtureSpans(): SpanRow[] {
  return ISSUE_2_ADDITIONAL_NEGATIVES.map((fixture, i) => {
    const time = generateTime(26 - Math.floor(i / 5), 10 + (i % 5))
    return createFixedSpan({
      traceId: requiredAt(SEED_ALIGNMENT_FIXTURE_TRACE_IDS, i),
      spanId: requiredAt(SEED_ALIGNMENT_FIXTURE_SPAN_IDS, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: fixture.userMessage,
      assistantResponse: fixture.agentResponse,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "alignment"],
      metadata: { story: "issue-2-alignment-fixtures" },
    })
  })
}

function buildLifecycleSpans(): SpanRow[] {
  const specs = [
    {
      userPrompt: "Summarize the deployment checklist for tonight's release.",
      assistantResponse:
        "Verify database migrations, confirm rollback steps, check dashboards after deploy, and alert the team if latency or errors spike.",
    },
    {
      userPrompt: "Draft a release note headline for the search improvements.",
      assistantResponse: "Release note headline draft: Faster semantic search with clearer result grouping.",
    },
    {
      userPrompt: "What's the warranty coverage for the Rocket-Powered Roller Skates?",
      assistantResponse:
        "The Rocket-Powered Roller Skates have a 12-month warranty covering manufacturing defects. Section 14.2 excludes cliff-related incidents.",
    },
    {
      userPrompt: "What is the blast radius for the TNT Bundle?",
      assistantResponse: "The TNT Bundle (10-Pack) has a rated blast radius of 15 meters in open terrain.",
    },
    {
      userPrompt: "Can you check the status of order ACM-12345?",
      assistantResponse:
        "Order ACM-12345 is currently in transit via Acme Ground. Estimated delivery: 3-5 business days.",
    },
  ] as const

  return specs.map((spec, i) => {
    const time = generateTime(12 - i, 10 + i)
    return createFixedSpan({
      traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, i),
      spanId: requiredAt(SEED_LIFECYCLE_SPAN_IDS, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: spec.userPrompt,
      assistantResponse: spec.assistantResponse,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "lifecycle"],
      metadata: { story: "score-ui-lifecycle-states" },
    })
  })
}

function buildSimulationTraceSpans(opts: {
  rows: readonly DatasetRow[]
  traceIds: readonly string[]
  spanIds: readonly string[]
  simulationId: string
  startIndex: number
  datasetName: string
  story: string
}): SpanRow[] {
  return opts.rows.map((row, i) => {
    const time = generateTime(opts.startIndex + i, 9 + (i % 5), i % 2 === 0 ? 6 : 7)
    return createFixedSpan({
      traceId: requiredAt(opts.traceIds, i),
      spanId: requiredAt(opts.spanIds, i),
      startTime: time.start,
      endTime: time.end,
      userPrompt: row.input,
      assistantResponse: row.output,
      systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
      serviceName: "acme-support-agent",
      tags: ["support", "simulation", opts.story],
      simulationId: opts.simulationId,
      metadata: {
        story: opts.story,
        dataset: opts.datasetName,
        difficulty: row.metadata.difficulty,
      },
    })
  })
}

const allFixedSpans = [
  ...buildAnnotationTraceSpans(),
  ...buildAlignmentFixtureSpans(),
  ...buildLifecycleSpans(),
  ...buildSimulationTraceSpans({
    rows: WARRANTY_DATASET_ROWS,
    traceIds: SEED_WARRANTY_SIMULATION_TRACE_IDS,
    spanIds: SEED_WARRANTY_SIMULATION_SPAN_IDS,
    simulationId: SEED_WARRANTY_SIMULATION_ID,
    startIndex: 6,
    datasetName: "Warranty Coverage Guardrails",
    story: "warranty-simulation",
  }),
  ...buildSimulationTraceSpans({
    rows: COMBINATION_DATASET_ROWS,
    traceIds: SEED_COMBINATION_SIMULATION_TRACE_IDS,
    spanIds: SEED_COMBINATION_SIMULATION_SPAN_IDS,
    simulationId: SEED_SIMULATION_ID,
    startIndex: 4,
    datasetName: "Dangerous Combination Guardrails",
    story: "combination-simulation",
  }),
]

const seedFixedTraces: Seeder = {
  name: "spans/fixed-traces",
  run: (ctx) =>
    insertJsonEachRow(ctx.client, "spans", allFixedSpans).pipe(
      Effect.tap(() =>
        Effect.sync(() => console.log(`  -> spans/fixed-traces: ${allFixedSpans.length} deterministic traces`)),
      ),
    ),
}

export const fixedTraceSeeders: readonly Seeder[] = [seedFixedTraces]
