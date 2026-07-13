import {
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import {
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
  TaxonomyProjectionMethod,
} from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { TaxonomyObservationRepositoryLive } from "./taxonomy-observation-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session-1")
const clusterId = TaxonomyClusterId("c".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const ch = setupTestClickHouse()

const makeObservation = (overrides: Partial<TaxonomyMomentObservation> = {}): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: "b".repeat(24),
  sessionId,
  analysisHash: "a".repeat(64),
  momentId: "moment-1",
  projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
  projectionHash: "d".repeat(64),
  projectionMetadata: { turnIndexes: [0, 2] },
  embedding: [1, 0, 0],
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  startTime: now,
  endTime: new Date("2026-05-24T12:01:00.000Z"),
  retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
  indexedAt: now,
  ...overrides,
})

const toClickHouseDateTime = (date: Date) => date.toISOString().replace("Z", "")

const makeObservationRow = (observation: TaxonomyMomentObservation) => ({
  organization_id: observation.organizationId as string,
  project_id: observation.projectId as string,
  observation_id: observation.observationId,
  session_id: observation.sessionId as string,
  analysis_hash: observation.analysisHash,
  moment_id: observation.momentId,
  projection_method: observation.projectionMethod,
  projection_hash: observation.projectionHash,
  projection_metadata: JSON.stringify(observation.projectionMetadata),
  embedding: [...observation.embedding],
  assigned_cluster_id: observation.assignedClusterId ?? "",
  assignment_confidence: observation.assignmentConfidence,
  assignment_method: observation.assignmentMethod,
  reassignment_run_id: observation.reassignmentRunId ?? "",
  start_time: toClickHouseDateTime(observation.startTime),
  end_time: toClickHouseDateTime(observation.endTime),
  retention_days: observation.retentionDays,
  indexed_at: toClickHouseDateTime(observation.indexedAt),
})

const runWithRepository = <A, E>(effect: Effect.Effect<A, E, TaxonomyObservationRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client, organizationId)))

describe("TaxonomyObservationRepositoryLive", () => {
  it("upserts moment-level observations and lists by session", async () => {
    const observation = makeObservation()

    const rows = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(observation)
        return yield* repo.listBySession({
          organizationId,
          projectId,
          sessionId,
          analysisHash: observation.analysisHash,
        })
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.momentId).toBe("moment-1")
    expect(rows[0]?.projectionMetadata).toEqual({ turnIndexes: [0, 2] })
  })

  it("ignores malformed legacy observation ids", async () => {
    const legacyProjectId = ProjectId("l".repeat(24))
    const legacySessionId = SessionId("legacy-session")
    const valid = makeObservation({
      observationId: "v".repeat(24),
      projectId: legacyProjectId,
      sessionId: legacySessionId,
      assignedClusterId: clusterId,
      assignmentMethod: "centroid_online",
      assignmentConfidence: 0.8,
    })
    const legacy = makeObservation({
      observationId: "f".repeat(32),
      projectId: legacyProjectId,
      sessionId: legacySessionId,
      momentId: "legacy-moment",
    })

    await ch.client.insert({
      table: "taxonomy_observations",
      values: [makeObservationRow(legacy)],
      format: "JSONEachRow",
    })

    const result = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(valid)
        const rows = yield* repo.listBySession({
          organizationId,
          projectId: legacyProjectId,
          sessionId: legacySessionId,
        })
        const sample = yield* repo.listForClusteringSample({
          organizationId,
          projectId: legacyProjectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
          limit: 10,
        })
        const counts = yield* repo.getCounts({
          organizationId,
          projectId: legacyProjectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
        })
        return { rows, sample, counts }
      }),
    )

    expect(result.rows.map((row) => row.observationId)).toEqual([valid.observationId])
    expect(result.sample.map((row) => row.observationId)).toEqual([valid.observationId])
    expect(result.counts).toEqual({ total: 1, assigned: 1, noise: 0 })
  })

  it("keeps noise and counts project-scoped", async () => {
    // Own project id: the single "topic" dimension no longer isolates this
    // test's rows from the ones inserted by earlier tests.
    const countsProjectId = ProjectId("c".repeat(24))
    const counts = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(makeObservation({ observationId: "n".repeat(24), projectId: countsProjectId }))
        yield* repo.upsert(
          makeObservation({
            observationId: "a".repeat(24),
            projectId: countsProjectId,
            projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
            projectionHash: "e".repeat(64),
          }),
        )
        yield* repo.upsert(
          makeObservation({
            observationId: "z".repeat(24),
            projectId: countsProjectId,
            assignedClusterId: clusterId,
            assignmentMethod: "centroid_online",
            assignmentConfidence: 0.91,
          }),
        )
        return yield* repo.getCounts({
          organizationId,
          projectId: countsProjectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
        })
      }),
    )

    expect(counts).toEqual({ total: 3, assigned: 1, noise: 2 })
  })

  it("rewrites observations for reassignment and lists by dimension and cluster", async () => {
    const observation = makeObservation({ observationId: "r".repeat(24), sessionId: SessionId("reassigned-session") })

    const rows = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(observation)
        yield* repo.reassignMany([
          {
            observation,
            assignedClusterId: clusterId,
            assignmentMethod: "gardening_reassign",
            assignmentConfidence: 0.82,
            reassignmentRunId: runId,
            indexedAt: new Date("2026-05-24T12:02:00.000Z"),
          },
        ])
        return yield* repo.listByCluster({
          organizationId,
          projectId,
          clusterId,
          limit: 10,
        })
      }),
    )

    expect(rows.map((row) => row.observationId)).toEqual([observation.observationId])
    expect(rows[0]?.assignmentMethod).toBe("gardening_reassign")
    expect(rows[0]?.reassignmentRunId).toBe(runId)
  })

  it("rewrites observations by id without loading full rows into the caller", async () => {
    const observation = makeObservation({
      observationId: "i".repeat(24),
      sessionId: SessionId("reassigned-by-id-session"),
      projectionMetadata: { summary: "metadata stays server-side" },
    })

    const rows = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(observation)
        yield* repo.reassignManyById({
          organizationId,
          projectId,
          assignments: [
            {
              observationId: observation.observationId,
              assignedClusterId: clusterId,
              assignmentMethod: "gardening_birth",
              assignmentConfidence: 0.73,
              reassignmentRunId: runId,
              indexedAt: new Date("2026-05-24T12:02:00.000Z"),
            },
          ],
        })
        return yield* repo.listBySession({ organizationId, projectId, sessionId: observation.sessionId })
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      observationId: observation.observationId,
      assignedClusterId: clusterId,
      assignmentMethod: "gardening_birth",
      assignmentConfidence: 0.73,
      reassignmentRunId: runId,
      projectionMetadata: { summary: "metadata stays server-side" },
    })
  })

  it("treats reassignment as one current observation", async () => {
    const observation = makeObservation({ observationId: "u".repeat(24), sessionId: SessionId("current-session") })

    const result = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(observation)
        yield* repo.reassignMany([
          {
            observation,
            assignedClusterId: clusterId,
            assignmentMethod: "gardening_reassign",
            assignmentConfidence: 0.82,
            reassignmentRunId: runId,
            indexedAt: new Date("2026-05-24T12:02:00.000Z"),
          },
        ])
        const counts = yield* repo.getCounts({
          organizationId,
          projectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
        })
        const noise = yield* repo.listNoise({
          organizationId,
          projectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
        })
        const assignments = yield* repo.getClusterAssignmentCounts({
          organizationId,
          projectId,
          clusterIds: [clusterId],
        })
        return { counts, noise, assignments }
      }),
    )

    expect(result.counts).toEqual({ total: 1, assigned: 1, noise: 0 })
    expect(result.noise).toHaveLength(0)
    expect(result.assignments).toMatchObject([{ clusterId, count: 1 }])
  })

  it("day-stratifies the clustering sample instead of taking newest-N", async () => {
    // Dedicated project so earlier tests' rows don't bleed into the sample.
    const stratifiedProjectId = ProjectId("s".repeat(24))
    const olderDay = new Date("2026-05-20T09:00:00.000Z")
    const newerDay = new Date("2026-05-23T09:00:00.000Z")
    // 3 observations on the older day, 3 on the newer day. A newest-N sample
    // with limit 2 would return two newer-day rows; a day-stratified sample
    // returns one row per day (round-robin rank-1 of each day first).
    const sample = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        for (let index = 0; index < 3; index++) {
          yield* repo.upsert(
            makeObservation({
              observationId: `old${index}`.padEnd(24, "0"),
              projectId: stratifiedProjectId,
              startTime: new Date(olderDay.getTime() + index * 60_000),
            }),
          )
          yield* repo.upsert(
            makeObservation({
              observationId: `new${index}`.padEnd(24, "0"),
              projectId: stratifiedProjectId,
              startTime: new Date(newerDay.getTime() + index * 60_000),
            }),
          )
        }
        return yield* repo.listForClusteringSample({
          organizationId,
          projectId: stratifiedProjectId,
          since: new Date("2026-05-19T00:00:00.000Z"),
          limit: 2,
        })
      }),
    )

    expect(sample).toHaveLength(2)
    const days = new Set(sample.map((observation) => observation.startTime.toISOString().slice(0, 10)))
    expect(days).toEqual(new Set(["2026-05-20", "2026-05-23"]))
  })
})

const makeLlmSpanRow = (overrides: {
  readonly projectId: ProjectId
  readonly sessionId: string
  readonly model: string
  readonly startTime: Date
  readonly traceId: string
  readonly spanId: string
}): SpanRow => ({
  organization_id: organizationId as string,
  project_id: overrides.projectId as string,
  session_id: overrides.sessionId,
  user_id: "",
  trace_id: overrides.traceId,
  span_id: overrides.spanId,
  parent_span_id: "",
  api_key_id: "test-api-key",
  simulation_id: "",
  start_time: toClickHouseDateTime(overrides.startTime),
  end_time: toClickHouseDateTime(new Date(overrides.startTime.getTime() + 1_000)),
  name: `chat ${overrides.model}`,
  service_name: "test-service",
  kind: 0,
  status_code: 0,
  status_message: "",
  error_type: "",
  tags: [],
  metadata: {},
  operation: "chat",
  provider: "openai",
  model: overrides.model,
  response_model: "",
  tokens_input: 10,
  tokens_output: 5,
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
  attr_string: {},
  attr_int: {},
  attr_float: {},
  attr_bool: {},
  resource_string: {},
  scope_name: "",
  scope_version: "",
})

describe("TaxonomyObservationRepositoryLive.listForCustomBehaviorSample", () => {
  // Regression for the scoped-sampling HAVING bug: a custom behavior filterSet
  // that compiles to a HAVING predicate (models/tags/cost/…) references rollup
  // aliases that only exist once LIST_SELECT is projected. Before the fix this
  // query threw "unknown identifier"; now it must filter to matching sessions.
  it("restricts the sample to sessions matching a filterSet that compiles to HAVING", async () => {
    const scopedProjectId = ProjectId("q".repeat(24))
    const matchSession = "cb-match-session"
    const otherSession = "cb-other-session"
    const at = new Date("2026-05-24T12:00:00.000Z")

    await ch.client.insert({
      table: "spans",
      values: [
        makeLlmSpanRow({
          projectId: scopedProjectId,
          sessionId: matchSession,
          model: "gpt-4",
          startTime: at,
          traceId: "t1",
          spanId: "s1",
        }),
        makeLlmSpanRow({
          projectId: scopedProjectId,
          sessionId: otherSession,
          model: "claude-3",
          startTime: at,
          traceId: "t2",
          spanId: "s2",
        }),
      ],
      format: "JSONEachRow",
    })
    await ch.client.insert({
      table: "taxonomy_observations",
      values: [
        makeObservationRow(
          makeObservation({
            observationId: "m".repeat(24),
            projectId: scopedProjectId,
            sessionId: SessionId(matchSession),
            startTime: at,
          }),
        ),
        makeObservationRow(
          makeObservation({
            observationId: "n".repeat(24),
            projectId: scopedProjectId,
            sessionId: SessionId(otherSession),
            startTime: at,
          }),
        ),
      ],
      format: "JSONEachRow",
    })

    const sample = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        return yield* repo.listForCustomBehaviorSample({
          organizationId,
          projectId: scopedProjectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
          limit: 10,
          filterSet: { models: [{ op: "in", value: ["gpt-4"] }] },
        })
      }),
    )

    expect(sample).toHaveLength(1)
    expect(sample[0]?.observationId).toBe("m".repeat(24))
    expect(sample[0]?.sessionId).toBe(matchSession)
  })
})
