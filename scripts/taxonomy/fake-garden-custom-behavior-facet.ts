#!/usr/bin/env tsx
/**
 * Dev-only shortcut: fake a second catalog card — a facet-scoped "main
 * behavior" — so `/behaviours` shows a small card (2 groups) next to the
 * bigger "Topics" card, without calling any AI/AWS service.
 *
 * `getBehaviourCatalog` only lists the global "Topics" entry plus custom
 * behaviors that are BOTH facet-scoped (`facetId !== null`) AND not a "view"
 * (an empty `filterSet`) — see `mainBehaviors` in
 * `apps/web/src/domains/taxonomy/behaviour-catalog.functions.ts`. The seeded QA
 * cohorts are all topic-scoped (`facetId: null`), so they never show as catalog
 * cards on their own (only as views nested under Topics). This script creates
 * a real facet + its whole-project "main behavior" row, then reuses the small
 * `qa-waiting-behavior` cohort's already-seeded sessions (2 sub-topics, 4
 * sessions each) as this behavior's 2 groups.
 *
 * Prerequisites: `pnpm seed` must have already run.
 *
 * Usage:
 *   pnpm exec tsx scripts/taxonomy/fake-garden-custom-behavior-facet.ts
 */
import { OrganizationId, ProjectId, SessionId, TaxonomyClusterId } from "@domain/shared"
import { CUSTOM_BEHAVIOR_QA_COHORT_LIST } from "@domain/shared/seed-content/custom-behavior-qa"
import { bootstrapSeedScope, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import {
  CustomBehaviorRepository,
  FacetRepository,
  TaxonomyClusterRepository,
  TaxonomyDimension,
  TaxonomyViewAssignmentRepository,
} from "@domain/taxonomy"
import { ChSqlClientLive, createClickhouseClient, TaxonomyViewAssignmentRepositoryLive } from "@platform/db-clickhouse"
import {
  createPostgresClient,
  CustomBehaviorRepositoryLive,
  FacetRepositoryLive,
  SqlClientLive,
  TaxonomyClusterRepositoryLive,
} from "@platform/db-postgres"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"

loadDevelopmentEnvironments(new URL("../../apps/workers/src/server.ts", import.meta.url).href)

const FACET_SLUG = "qa-user-goal"
const FACET_NAME = "User goal"
const FACET_DESCRIPTION = "What the user was trying to accomplish in the session."
const FACET_INSTRUCTIONS =
  "Summarize, in one short phrase, the goal the user was trying to accomplish in this session."
const SOURCE_COHORT_ID_KEY = "custom-behavior-qa-c"

const FAKE_CENTROID_MODEL = "voyage-4-large"
const FAKE_CENTROID_DECAY_SECONDS = 30 * 24 * 60 * 60

const humanizeKey = (key: string): string =>
  key
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

interface ObservationRow {
  readonly observation_id: string
  readonly session_id: string
  readonly start_time: string
}

const parseClickhouseDate = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)

const main = async () => {
  const organizationId = OrganizationId(SEED_ORG_ID)
  const projectId = ProjectId(SEED_PROJECT_ID)

  const cohort = CUSTOM_BEHAVIOR_QA_COHORT_LIST.find((candidate) => candidate.idKey === SOURCE_COHORT_ID_KEY)
  if (!cohort) throw new Error(`seed cohort "${SOURCE_COHORT_ID_KEY}" not found — did the QA fixture content change?`)

  const pg = createPostgresClient()
  const ch = createClickhouseClient()

  try {
    const provideFacetRepo = <A, E>(effect: Effect.Effect<A, E, FacetRepository>) =>
      effect.pipe(Effect.provide(FacetRepositoryLive), Effect.provide(SqlClientLive(pg, organizationId)))
    const provideCustomBehaviorRepo = <A, E>(effect: Effect.Effect<A, E, CustomBehaviorRepository>) =>
      effect.pipe(Effect.provide(CustomBehaviorRepositoryLive), Effect.provide(SqlClientLive(pg, organizationId)))
    const provideClusterRepo = <A, E>(effect: Effect.Effect<A, E, TaxonomyClusterRepository>) =>
      effect.pipe(Effect.provide(TaxonomyClusterRepositoryLive), Effect.provide(SqlClientLive(pg, organizationId)))
    const provideViewAssignmentRepo = <A, E>(effect: Effect.Effect<A, E, TaxonomyViewAssignmentRepository>) =>
      effect.pipe(
        Effect.provide(TaxonomyViewAssignmentRepositoryLive),
        Effect.provide(ChSqlClientLive(ch, organizationId)),
      )

    const now = new Date()
    const facetId = bootstrapSeedScope.cuid(`${FACET_SLUG}:facet`)
    const behaviorId = bootstrapSeedScope.cuid(`${FACET_SLUG}:behavior`)

    const facet = await Effect.runPromise(
      provideFacetRepo(
        Effect.gen(function* () {
          const repo = yield* FacetRepository
          const existing = yield* repo.findBySlug({ projectId, slug: FACET_SLUG })
          if (existing) return existing
          const created = {
            id: facetId,
            organizationId,
            projectId,
            slug: FACET_SLUG,
            name: FACET_NAME,
            description: FACET_DESCRIPTION,
            instructions: FACET_INSTRUCTIONS,
            createdAt: now,
            updatedAt: now,
          }
          yield* repo.save(created)
          return created
        }),
      ),
    )

    const behavior = await Effect.runPromise(
      provideCustomBehaviorRepo(
        Effect.gen(function* () {
          const repo = yield* CustomBehaviorRepository
          const existing = yield* repo.findBySlug({ projectId, slug: FACET_SLUG })
          if (existing) return existing
          const created = {
            id: behaviorId,
            organizationId,
            projectId,
            name: FACET_NAME,
            slug: FACET_SLUG,
            // Empty filterSet = the facet's whole-project ("main") behavior, not a
            // narrowed view — see `isCustomBehaviorView`.
            filterSet: {},
            facetId: facet.id,
            status: "ready" as const,
            createdAt: now,
            updatedAt: now,
          }
          yield* repo.save(created)
          return created
        }),
      ),
    )

    let totalObservations = 0
    for (const subTopic of cohort.subTopics) {
      const observationIds = Array.from({ length: subTopic.sessionCount }, (_, member) =>
        bootstrapSeedScope.cuid(`${cohort.idKey}:obs:${subTopic.key}:${member}`),
      )

      const result = await ch.query({
        query: `SELECT observation_id, session_id, start_time
                FROM taxonomy_observations FINAL
                WHERE organization_id = {organizationId:String}
                  AND project_id = {projectId:String}
                  AND observation_id IN {ids:Array(String)}`,
        query_params: { organizationId, projectId, ids: observationIds },
        format: "JSONEachRow",
      })
      const rows = await result.json<ObservationRow>()
      if (rows.length === 0) {
        console.warn(`  -> ${subTopic.key}: no seeded observations found, skipping (did you run \`pnpm seed\`?)`)
        continue
      }

      const clusterId = TaxonomyClusterId(bootstrapSeedScope.cuid(`${FACET_SLUG}:cluster:${subTopic.key}`))
      const startTimes = rows.map((row) => parseClickhouseDate(row.start_time).getTime())
      const firstObservedAt = new Date(Math.min(...startTimes))
      const lastObservedAt = new Date(Math.max(...startTimes))

      await Effect.runPromise(
        provideClusterRepo(
          Effect.gen(function* () {
            const clusters = yield* TaxonomyClusterRepository
            yield* clusters.save({
              id: clusterId,
              organizationId,
              projectId,
              customBehaviorId: behavior.id,
              facetId: facet.id,
              dimension: TaxonomyDimension.Topic,
              parentClusterId: null,
              depth: 0,
              path: "",
              splitLinkThreshold: null,
              name: humanizeKey(subTopic.key),
              description: subTopic.summary,
              centroid: {
                base: [],
                mass: 0,
                model: FAKE_CENTROID_MODEL,
                decay: FAKE_CENTROID_DECAY_SECONDS,
                weights: { default: 1 },
              },
              observationCount: rows.length,
              state: "active",
              mergedIntoClusterId: null,
              firstObservedAt,
              lastObservedAt,
              clusteredAt: now,
              createdAt: now,
              updatedAt: now,
            })
          }),
        ),
      )

      await Effect.runPromise(
        provideViewAssignmentRepo(
          Effect.gen(function* () {
            const assignments = yield* TaxonomyViewAssignmentRepository
            yield* assignments.upsertMany(
              rows.map((row) => ({
                organizationId,
                projectId,
                customBehaviorId: behavior.id,
                facetId: facet.id,
                observationId: row.observation_id,
                sessionId: SessionId(row.session_id),
                assignedClusterId: clusterId,
                assignmentConfidence: 0.9,
                assignmentMethod: "fake_dev_seed",
                reassignmentRunId: null,
                startTime: parseClickhouseDate(row.start_time),
                retentionDays: 90,
                indexedAt: now,
              })),
            )
          }),
        ),
      )

      totalObservations += rows.length
      console.log(`  -> ${subTopic.key}: ${rows.length} sessions -> cluster ${clusterId}`)
    }

    console.log(
      `Done. Facet "${FACET_SLUG}" + behavior "${behavior.slug}" now has ${cohort.subTopics.length} group(s) covering ${totalObservations} sessions, status=ready.`,
    )
  } finally {
    await pg.pool.end()
    await ch.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
