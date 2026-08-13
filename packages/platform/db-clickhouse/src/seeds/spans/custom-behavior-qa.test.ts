import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import type { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import {
  CUSTOM_BEHAVIOR_QA_COHORT_LIST,
  CUSTOM_BEHAVIOR_QA_COHORTS,
} from "@domain/shared/seed-content/custom-behavior-qa"
import { bootstrapSeedScope } from "@domain/shared/seeding"
import {
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TaxonomyObservationRepository,
} from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { TaxonomyObservationRepositoryLive } from "../../repositories/taxonomy-observation-repository.ts"
import { withClickHouse } from "../../with-clickhouse.ts"
import { buildCustomBehaviorQaFixture } from "./custom-behavior-qa.ts"

const ch = setupTestClickHouse({ truncateBetweenTests: false })

const organizationId = bootstrapSeedScope.organizationId as OrganizationId
const projectId = bootstrapSeedScope.projectId as ProjectId
const NOW_MS = Date.parse("2026-07-14T12:00:00.000Z")
const SINCE = new Date(NOW_MS - TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

const { spans, observations, analyses, momentLabels } = buildCustomBehaviorQaFixture(bootstrapSeedScope, NOW_MS)

const cohortSize = (cohort: (typeof CUSTOM_BEHAVIOR_QA_COHORTS)["a"]) =>
  cohort.subTopics.reduce((sum, topic) => sum + topic.sessionCount, 0)

const runWithRepository = <A, E>(effect: Effect.Effect<A, E, TaxonomyObservationRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client, organizationId)))

describe("customBehaviorQa fixture", () => {
  beforeAll(async () => {
    await ch.client.insert({ table: "spans", values: spans, format: "JSONEachRow" })
    await ch.client.insert({ table: "taxonomy_observations", values: observations, format: "JSONEachRow" })
  })

  it("builds clustered observations with non-empty embeddings and global cluster ids", () => {
    const totalObservations = CUSTOM_BEHAVIOR_QA_COHORT_LIST.reduce((sum, cohort) => sum + cohortSize(cohort), 0)
    const totalSubTopics = CUSTOM_BEHAVIOR_QA_COHORT_LIST.reduce((sum, cohort) => sum + cohort.subTopics.length, 0)
    expect(observations).toHaveLength(totalObservations)
    for (const observation of observations) {
      expect(observation.embedding.length).toBe(EMBEDDING_DIMENSIONS)
      expect(observation.assigned_cluster_id.length).toBe(24)
      expect(observation.observation_id.length).toBe(24)
    }
    // Distinct global clusters per cohort (>1 sub-topic) — the geometry a
    // successful scoped generation resolves into more than one cluster.
    const clusterIds = new Set(observations.map((observation) => observation.assigned_cluster_id))
    expect(clusterIds.size).toBe(totalSubTopics)
  })

  it("emits an analysis and moment labels per session, joined by a shared analysis_hash", () => {
    const totalSessions = CUSTOM_BEHAVIOR_QA_COHORT_LIST.reduce((sum, cohort) => sum + cohortSize(cohort), 0)

    expect(analyses).toHaveLength(totalSessions)
    expect(momentLabels).toHaveLength(totalSessions * 2)
    for (const analysis of analyses) {
      expect(analysis.analysis_status).toBe("analyzed")
      expect(analysis.analysis_hash.length).toBe(64)
      expect(analysis.trace_ids).toHaveLength(1)
    }

    // The Behaviours drawer joins observations → analyses → moment labels on
    // (session_id, analysis_hash), so all three must agree per session.
    const analysisHashBySession = new Map(analyses.map((analysis) => [analysis.session_id, analysis.analysis_hash]))
    for (const observation of observations) {
      expect(analysisHashBySession.get(observation.session_id)).toBe(observation.analysis_hash)
    }
    for (const label of momentLabels) {
      expect(analysisHashBySession.get(label.session_id)).toBe(label.analysis_hash)
    }

    // Every metric-bearing kind is present so the trajectory chart has data.
    const kinds = new Set(momentLabels.map((label) => label.kind))
    for (const kind of ["resolution", "escalation", "user_frustration", "user_satisfaction", "abandonment"]) {
      expect(kinds.has(kind)).toBe(true)
    }
  })

  it("previews ≥15 for the two full cohorts and <15 for the waiting cohort", async () => {
    const { a, b, c } = CUSTOM_BEHAVIOR_QA_COHORTS
    const [countA, countB, countC] = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        return [
          yield* repo.countForCustomBehaviorSample({ organizationId, projectId, since: SINCE, filterSet: a.filterSet }),
          yield* repo.countForCustomBehaviorSample({ organizationId, projectId, since: SINCE, filterSet: b.filterSet }),
          yield* repo.countForCustomBehaviorSample({ organizationId, projectId, since: SINCE, filterSet: c.filterSet }),
        ] as const
      }),
    )

    expect(countA.observationCount).toBe(cohortSize(a))
    expect(countB.observationCount).toBe(cohortSize(b))
    expect(countA.observationCount).toBeGreaterThanOrEqual(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(countB.observationCount).toBeGreaterThanOrEqual(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(countA.sessionCount).toBe(cohortSize(a))
    expect(countB.sessionCount).toBe(cohortSize(b))

    // Cohort C matches its sessions but stays under the gate → gardening waits.
    expect(countC.observationCount).toBe(cohortSize(c))
    expect(countC.observationCount).toBeLessThan(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
  })

  it("samples only the sessions matching each cohort's filter (no cross-cohort bleed)", async () => {
    const { a, b } = CUSTOM_BEHAVIOR_QA_COHORTS
    const [sampleA, sampleB] = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        return [
          yield* repo.listForCustomBehaviorSample({
            organizationId,
            projectId,
            since: SINCE,
            limit: 1000,
            filterSet: a.filterSet,
          }),
          yield* repo.listForCustomBehaviorSample({
            organizationId,
            projectId,
            since: SINCE,
            limit: 1000,
            filterSet: b.filterSet,
          }),
        ] as const
      }),
    )

    // Each cohort's sample is exactly its own size — the userId filter never
    // catches the serviceNames cohort and vice-versa.
    expect(sampleA).toHaveLength(cohortSize(a))
    expect(sampleB).toHaveLength(cohortSize(b))
    const sessionsA = new Set(sampleA.map((observation) => observation.sessionId))
    const sessionsB = new Set(sampleB.map((observation) => observation.sessionId))
    for (const sessionId of sessionsA) expect(sessionsB.has(sessionId)).toBe(false)
    for (const observation of sampleA) expect(observation.embedding.length).toBe(EMBEDDING_DIMENSIONS)
  })
})
