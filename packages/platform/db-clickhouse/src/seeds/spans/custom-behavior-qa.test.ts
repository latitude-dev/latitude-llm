import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import type { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { CUSTOM_BEHAVIOR_QA_COHORTS } from "@domain/shared/seed-content/custom-behavior-qa"
import { bootstrapSeedScope } from "@domain/shared/seeding"
import {
  CUSTOM_BEHAVIOR_LOOKBACK_DAYS,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TaxonomyObservationRepository,
} from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TaxonomyObservationRepositoryLive } from "../../repositories/taxonomy-observation-repository.ts"
import { withClickHouse } from "../../with-clickhouse.ts"
import { buildCustomBehaviorQaFixture } from "./custom-behavior-qa.ts"

const ch = setupTestClickHouse()

const organizationId = bootstrapSeedScope.organizationId as OrganizationId
const projectId = bootstrapSeedScope.projectId as ProjectId
const NOW_MS = Date.parse("2026-07-14T12:00:00.000Z")
const SINCE = new Date(NOW_MS - CUSTOM_BEHAVIOR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

const cohortSize = (cohort: (typeof CUSTOM_BEHAVIOR_QA_COHORTS)["a"]) =>
  cohort.subTopics.reduce((sum, topic) => sum + topic.sessionCount, 0)

const runWithRepository = <A, E>(effect: Effect.Effect<A, E, TaxonomyObservationRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client, organizationId)))

describe("customBehaviorQa fixture", () => {
  beforeEach(async () => {
    // Runs after the testkit's truncate-all beforeEach, so it re-seeds each test.
    const { spans, observations } = buildCustomBehaviorQaFixture(bootstrapSeedScope, NOW_MS)
    await ch.client.insert({ table: "spans", values: spans, format: "JSONEachRow" })
    await ch.client.insert({ table: "taxonomy_observations", values: observations, format: "JSONEachRow" })
  })

  it("builds clustered observations with non-empty embeddings and global cluster ids", () => {
    const { observations } = buildCustomBehaviorQaFixture(bootstrapSeedScope, NOW_MS)
    expect(observations).toHaveLength(
      cohortSize(CUSTOM_BEHAVIOR_QA_COHORTS.a) + cohortSize(CUSTOM_BEHAVIOR_QA_COHORTS.b),
    )
    for (const observation of observations) {
      expect(observation.embedding.length).toBe(EMBEDDING_DIMENSIONS)
      expect(observation.assigned_cluster_id.length).toBe(24)
      expect(observation.observation_id.length).toBe(24)
    }
    // Distinct global clusters per cohort (>1 sub-topic) — the geometry a
    // successful scoped generation resolves into more than one cluster.
    const clusterIds = new Set(observations.map((observation) => observation.assigned_cluster_id))
    expect(clusterIds.size).toBe(
      CUSTOM_BEHAVIOR_QA_COHORTS.a.subTopics.length + CUSTOM_BEHAVIOR_QA_COHORTS.b.subTopics.length,
    )
  })

  it("previews ≥15 observations for both cohorts inside the lookback window", async () => {
    const { a, b } = CUSTOM_BEHAVIOR_QA_COHORTS
    const [countA, countB] = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        return [
          yield* repo.countForCustomBehaviorSample({ organizationId, projectId, since: SINCE, filterSet: a.filterSet }),
          yield* repo.countForCustomBehaviorSample({ organizationId, projectId, since: SINCE, filterSet: b.filterSet }),
        ] as const
      }),
    )

    expect(countA.observationCount).toBe(cohortSize(a))
    expect(countB.observationCount).toBe(cohortSize(b))
    expect(countA.observationCount).toBeGreaterThanOrEqual(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(countB.observationCount).toBeGreaterThanOrEqual(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(countA.sessionCount).toBe(cohortSize(a))
    expect(countB.sessionCount).toBe(cohortSize(b))
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
