import { createHash } from "node:crypto"
import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import {
  CUSTOM_BEHAVIOR_QA_COHORT_LIST,
  type CustomBehaviorQaCohort,
} from "@domain/shared/seed-content/custom-behavior-qa"
import type { SeedScope } from "@domain/shared/seeding"
import {
  normalizeTaxonomyEmbedding,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TaxonomyProjectionMethod,
} from "@domain/taxonomy"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder } from "../types.ts"
import type { SpanRow } from "./span-builders.ts"

const DAY_MS = 24 * 60 * 60 * 1000
// The shared global gardening sample window (the window the divisive build
// day-stratifies over). Custom-behavior gardening samples over the same window,
// so the seed anchors observation recency to it rather than a custom-specific
// constant.
const GARDENING_SAMPLE_WINDOW_DAYS = TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS
/** Small isotropic jitter around each centroid — tight enough to stay one cluster per sub-topic. */
const JITTER_SCALE = 0.15
/** Matches the retention the real conversation-intelligence pipeline stamps. */
const CI_RETENTION_DAYS = 90
// Metric-bearing moment kinds cycled per session so every Behaviours trajectory
// metric has data: frequency (any kind), escalation, resolution, churn risk
// (user_frustration/abandonment), and wins (resolution/user_satisfaction).
const QA_MOMENT_KIND_CYCLE = [
  "resolution",
  "escalation",
  "user_frustration",
  "user_satisfaction",
  "abandonment",
] as const

// Mirror of the signals-seed embedding model (`db-postgres/src/seeds/signals`):
// a deterministic unit vector per seed key, so re-seeds reproduce identical
// geometry and distinct keys land near-orthogonal in 2048-dim space.
function hashString(input: string): number {
  let hash = 1779033703 ^ input.length
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  return hash >>> 0 || 1
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function deterministicUnitVector(seedKey: string, dimensions: number): number[] {
  const rand = seededRandom(hashString(seedKey))
  const vector = new Array<number>(dimensions)
  let magnitudeSquared = 0
  for (let index = 0; index < dimensions; index++) {
    const value = rand() - 0.5
    vector[index] = value
    magnitudeSquared += value * value
  }
  const magnitude = Math.sqrt(magnitudeSquared)
  if (magnitude === 0) {
    vector.fill(0)
    vector[0] = 1
    return vector
  }
  for (let index = 0; index < vector.length; index++) {
    vector[index] = (vector[index] ?? 0) / magnitude
  }
  return vector
}

function jitteredEmbedding(centroid: readonly number[], seedKey: string): number[] {
  const rand = seededRandom(hashString(seedKey))
  const jittered = centroid.map((value) => value + (rand() - 0.5) * JITTER_SCALE)
  return [...normalizeTaxonomyEmbedding(jittered)]
}

const hex64 = (parts: readonly string[]): string => createHash("sha256").update(parts.join("\x00")).digest("hex")

const formatClickHouseTimestamp = (date: Date): string => date.toISOString().replace("T", " ").replace("Z", "000")

type TaxonomyObservationSeedRow = {
  organization_id: string
  project_id: string
  observation_id: string
  session_id: string
  analysis_hash: string
  moment_id: string
  projection_method: string
  projection_hash: string
  projection_metadata: string
  embedding: number[]
  assigned_cluster_id: string
  assignment_confidence: number
  assignment_method: string
  reassignment_run_id: string
  start_time: string
  end_time: string
  retention_days: number
  indexed_at: string
}

type SessionAnalysisSeedRow = {
  organization_id: string
  project_id: string
  session_id: string
  start_time: string
  end_time: string
  trace_ids: string[]
  analysis_hash: string
  analysis_status: string
  status_reason: string
  retention_days: number
  indexed_at: string
}

type SessionMomentLabelSeedRow = {
  organization_id: string
  project_id: string
  session_id: string
  analysis_hash: string
  label_id: string
  moment_id: string
  kind: string
  actor: string
  first_message_index: number
  last_message_index: number
  summary: string
  evidence: string
  confidence: number
  retention_days: number
  indexed_at: string
}

interface CustomBehaviorQaFixture {
  readonly spans: SpanRow[]
  readonly observations: TaxonomyObservationSeedRow[]
  readonly analyses: SessionAnalysisSeedRow[]
  readonly momentLabels: SessionMomentLabelSeedRow[]
}

const buildCohortRows = (cohort: CustomBehaviorQaCohort, scope: SeedScope, nowMs: number): CustomBehaviorQaFixture => {
  const spans: SpanRow[] = []
  const observations: TaxonomyObservationSeedRow[] = []
  const analyses: SessionAnalysisSeedRow[] = []
  const momentLabels: SessionMomentLabelSeedRow[] = []
  const indexedAt = formatClickHouseTimestamp(new Date(nowMs))
  let sessionIndex = 0

  for (const subTopic of cohort.subTopics) {
    // One centroid per sub-topic; distinct sub-topics stay near-orthogonal, so a
    // successful generation produces more than one scoped cluster.
    const centroid = deterministicUnitVector(`${cohort.idKey}:centroid:${subTopic.key}`, EMBEDDING_DIMENSIONS)
    // A per-sub-topic global cluster id: proves the seed carries a global
    // assignment that scoped generation must never overwrite.
    const globalClusterId = scope.cuid(`${cohort.idKey}:global-cluster:${subTopic.key}`)

    for (let member = 0; member < subTopic.sessionCount; member++) {
      const memberKey = `${cohort.idKey}:${subTopic.key}:${member}`
      // Spread sessions across the sample window so day-stratified sampling sees several days.
      const daysAgo = sessionIndex % GARDENING_SAMPLE_WINDOW_DAYS
      const start = new Date(nowMs - daysAgo * DAY_MS - (sessionIndex % 6) * 60 * 60 * 1000)
      const traceId = scope.traceHex(cohort.idKey, sessionIndex)
      const spanId = scope.spanHex(cohort.idKey, sessionIndex)
      const startTs = formatClickHouseTimestamp(start)
      const endTs = formatClickHouseTimestamp(new Date(start.getTime() + 60_000))
      // Shared across the session's observation, analysis, and moment labels so
      // the Behaviours drawer's session/moment joins line up.
      const analysisHash = hex64(["analysis", memberKey])
      const momentId = scope.cuid(`${cohort.idKey}:moment:${subTopic.key}:${member}`)

      spans.push({
        organization_id: scope.organizationId,
        project_id: scope.projectId,
        session_id: traceId,
        user_id: cohort.userId,
        user_email: "",
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: "",
        api_key_id: scope.apiKeyId,
        simulation_id: "",
        start_time: startTs,
        end_time: endTs,
        name: "chat gpt-4.1",
        service_name: cohort.serviceName,
        kind: 1,
        status_code: 1,
        status_message: "",
        error_type: "",
        tags: ["support", "custom-behavior-qa", cohort.idKey],
        metadata: cohort.metadata,
        operation: "chat",
        provider: "openai",
        model: "gpt-4.1",
        agent_name: "",
        response_model: "gpt-4.1-2025-04-14",
        tokens_input: 40,
        tokens_output: 20,
        tokens_cache_read: 0,
        tokens_cache_create: 0,
        tokens_reasoning: 0,
        cost_input_microcents: 1000,
        cost_output_microcents: 2000,
        cost_total_microcents: 3000,
        cost_is_estimated: 1,
        time_to_first_token_ns: 180_000_000,
        is_streaming: 1,
        response_id: `seed-${spanId}`,
        finish_reasons: ["stop"],
        input_messages: JSON.stringify([{ role: "user", parts: [{ type: "text", content: subTopic.summary }] }]),
        output_messages: JSON.stringify([
          { role: "assistant", parts: [{ type: "text", content: `Helping with: ${subTopic.summary}` }] },
        ]),
        system_instructions: JSON.stringify([{ type: "text", content: "You are a QA fixture support agent." }]),
        tool_definitions: "",
        tool_call_id: "",
        tool_name: "",
        tool_input: "",
        tool_output: "",
        attr_string: {},
        attr_int: {},
        attr_float: { "gen_ai.request.temperature": 0 },
        attr_bool: {},
        resource_string: { "service.name": cohort.serviceName },
        scope_name: "openai-instrumentation",
        scope_version: "1.0.0",
      })

      observations.push({
        organization_id: scope.organizationId,
        project_id: scope.projectId,
        observation_id: scope.cuid(`${cohort.idKey}:obs:${subTopic.key}:${member}`),
        session_id: traceId,
        analysis_hash: analysisHash,
        moment_id: momentId,
        projection_method: TaxonomyProjectionMethod.MomentTextEmbedding,
        projection_hash: hex64(["projection", memberKey]),
        projection_metadata: JSON.stringify({ projectionKind: "session_conversation", summary: subTopic.summary }),
        embedding: jitteredEmbedding(centroid, `${memberKey}:jitter`),
        assigned_cluster_id: globalClusterId,
        assignment_confidence: 0.9,
        assignment_method: "centroid_online",
        reassignment_run_id: "",
        start_time: startTs,
        end_time: endTs,
        retention_days: TAXONOMY_OBSERVATION_RETENTION_DAYS,
        indexed_at: indexedAt,
      })

      analyses.push({
        organization_id: scope.organizationId,
        project_id: scope.projectId,
        session_id: traceId,
        start_time: startTs,
        end_time: endTs,
        trace_ids: [traceId],
        analysis_hash: analysisHash,
        analysis_status: "analyzed",
        status_reason: "",
        retention_days: CI_RETENTION_DAYS,
        indexed_at: indexedAt,
      })

      // Two moments per session: a per-session cycling kind (spreads the
      // trajectory metrics) plus a resolution (keeps frequency/wins populated).
      // The turn indices fan out so the trajectory chart has a distribution.
      const primaryKind = QA_MOMENT_KIND_CYCLE[sessionIndex % QA_MOMENT_KIND_CYCLE.length] ?? "resolution"
      const primaryTurn = 4 + (sessionIndex % 10) * 4
      const secondaryTurn = 2 + (sessionIndex % 5) * 3
      momentLabels.push(
        {
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          session_id: traceId,
          analysis_hash: analysisHash,
          label_id: scope.cuid(`${memberKey}:label:0`),
          moment_id: momentId,
          kind: primaryKind,
          actor: "user",
          first_message_index: primaryTurn,
          last_message_index: primaryTurn + 1,
          summary: subTopic.summary,
          evidence: subTopic.summary,
          confidence: 0.9,
          retention_days: CI_RETENTION_DAYS,
          indexed_at: indexedAt,
        },
        {
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          session_id: traceId,
          analysis_hash: analysisHash,
          label_id: scope.cuid(`${memberKey}:label:1`),
          moment_id: scope.cuid(`${cohort.idKey}:moment2:${subTopic.key}:${member}`),
          kind: "resolution",
          actor: "assistant",
          first_message_index: secondaryTurn,
          last_message_index: secondaryTurn + 1,
          summary: subTopic.summary,
          evidence: subTopic.summary,
          confidence: 0.88,
          retention_days: CI_RETENTION_DAYS,
          indexed_at: indexedAt,
        },
      )

      sessionIndex++
    }
  }

  return { spans, observations, analyses, momentLabels }
}

/**
 * Build the full QA fixture (every cohort). Pure — the seeder inserts the
 * result; tests exercise the repository queries against it directly.
 * `nowMs` anchors recency to wall-clock time so every observation lands
 * inside the gardening sample window at generation time.
 */
export const buildCustomBehaviorQaFixture = (scope: SeedScope, nowMs: number): CustomBehaviorQaFixture => {
  const spans: SpanRow[] = []
  const observations: TaxonomyObservationSeedRow[] = []
  const analyses: SessionAnalysisSeedRow[] = []
  const momentLabels: SessionMomentLabelSeedRow[] = []
  for (const cohort of CUSTOM_BEHAVIOR_QA_COHORT_LIST) {
    const rows = buildCohortRows(cohort, scope, nowMs)
    spans.push(...rows.spans)
    observations.push(...rows.observations)
    analyses.push(...rows.analyses)
    momentLabels.push(...rows.momentLabels)
  }
  return { spans, observations, analyses, momentLabels }
}

// Bootstrap-only QA fixture: injects the custom-behavior cohorts
// (backing sessions + clustered taxonomy observations) on the seed project —
// two above the ≥15 gardening gate and one under it (the waiting state). Kept
// out of `allSeeders` so it never runs during runtime demo-project creation.
export const customBehaviorQaSeeder: Seeder = {
  name: "spans/custom-behavior-qa",
  run: (ctx) =>
    Effect.gen(function* () {
      const nowMs = Date.now()
      const since = new Date(nowMs - GARDENING_SAMPLE_WINDOW_DAYS * DAY_MS)
      const sentinelObservationId = ctx.scope.cuid("custom-behavior-qa-a:obs:a-order-status:0")
      // Recency-aware sentinel: skip only when the first fixture observation is
      // present AND still inside the sample window. A fixture seeded more than
      // the window ago is stale — reseed so its observations land back inside
      // the window (the re-inserted ids collapse to the fresh rows under
      // `taxonomy_observations FINAL` at query time).
      const freshFixturePresent = yield* isSentinelPresent(
        ctx.client,
        "taxonomy_observations",
        "observation_id = {observationId:String} AND start_time >= {since:DateTime64(9, 'UTC')}",
        { observationId: sentinelObservationId, since: formatClickHouseTimestamp(since) },
      )
      if (freshFixturePresent) {
        if (!ctx.quiet) console.log("  -> spans/custom-behavior-qa: already seeded (fresh), skipping")
        return
      }

      const { spans, observations, analyses, momentLabels } = buildCustomBehaviorQaFixture(ctx.scope, nowMs)
      yield* insertJsonEachRow(ctx.client, "spans", spans)
      yield* insertJsonEachRow(ctx.client, "taxonomy_observations", observations)
      yield* insertJsonEachRow(ctx.client, "session_analyses", analyses)
      yield* insertJsonEachRow(ctx.client, "session_moment_labels", momentLabels)
      if (!ctx.quiet) {
        console.log(
          `  -> spans/custom-behavior-qa: ${spans.length} sessions + ${observations.length} observations + ${analyses.length} analyses + ${momentLabels.length} moment labels across ${CUSTOM_BEHAVIOR_QA_COHORT_LIST.length} cohorts`,
        )
      }
    }),
}
