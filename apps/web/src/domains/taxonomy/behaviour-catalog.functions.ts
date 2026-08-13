import { CustomBehaviorId, FacetId, ProjectId } from "@domain/shared"
import {
  CustomBehaviorRepository,
  type CustomBehaviorStatus,
  countCustomBehaviorViews,
  FacetRepository,
  isCustomBehaviorView,
  listProjectBehavioursUseCase,
  type ProjectBehaviourNode,
  type TaxonomyClusterTrendStatus,
  TOPICS_BEHAVIOR_SLUG,
} from "@domain/taxonomy"
import { TaxonomyObservationRepositoryLive, TaxonomyViewAssignmentRepositoryLive } from "@platform/db-clickhouse"
import { CustomBehaviorRepositoryLive, FacetRepositoryLive, TaxonomyClusterRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"
import { isOpenableBehaviourTree } from "./behaviour-tree-visibility.ts"

/** The whole-project topic behavior has no row, so its card copy lives here rather than in a table. */
export const TOPICS_BEHAVIOR_NAME = "Topics"
export const TOPICS_BEHAVIOR_DESCRIPTION =
  "Groups every session by what it was about. This is the behavior Latitude builds from your traffic by default, with nothing to set up."

export interface BehaviourCatalogGroupRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly sessionCount: number
  readonly trend: TaxonomyClusterTrendStatus
}

export interface BehaviourCatalogEntryRecord {
  /** Routes the card: `lat-topics` for the topic behavior, else the behavior's slug. */
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly status: CustomBehaviorStatus
  /** null on the topic behavior, which has no `custom_behaviors` row. */
  readonly customBehaviorId: string | null
  readonly facetId: string | null
  readonly viewCount: number
  readonly sessionCount: number
  readonly groups: readonly BehaviourCatalogGroupRecord[]
}

const clickHouseCatalogLayer = Layer.mergeAll(TaxonomyObservationRepositoryLive, TaxonomyViewAssignmentRepositoryLive)
const postgresCatalogLayer = Layer.mergeAll(
  TaxonomyClusterRepositoryLive,
  CustomBehaviorRepositoryLive,
  FacetRepositoryLive,
)

/**
 * The teaser rows: every top-level group, highest-volume first — a panel is a
 * preview of what the behavior found, not the tree itself, so nested breakdowns
 * stay behind the click into the tree, but nothing at the top level is hidden.
 */
const toGroupRecords = (roots: readonly ProjectBehaviourNode[]): readonly BehaviourCatalogGroupRecord[] =>
  roots.map((node) => ({
    id: node.cluster.id,
    name: node.cluster.name,
    description: node.cluster.description,
    sessionCount: node.subtreeObservationCount,
    trend: node.trend.status,
  }))

/**
 * The Behaviors home: one entry per main behavior (the topic behavior plus every
 * whole-project facet view), each with its top groups as a teaser of the tree.
 *
 * Deliberately NOT `getProjectBehaviours` per card — that read fans out a
 * ClickHouse intelligence aggregate per node and a PCA over every centroid, which
 * a grid of teasers has no use for. This reuses the same tree use-case (so the
 * counts match the tree the card links to) and keeps only the roots.
 */
export const getBehaviourCatalog = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly BehaviourCatalogEntryRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const behaviorRepository = yield* CustomBehaviorRepository
        const facetRepository = yield* FacetRepository
        const behaviors = yield* behaviorRepository.listByProject({ projectId })
        const facets = yield* facetRepository.listByProject({ projectId })
        const descriptionByFacetId = new Map(facets.map((facet) => [facet.id as string, facet.description] as const))

        // A main behavior is the whole-project view of a facet; the topic
        // behavior is the one with no row at all.
        const mainBehaviors = behaviors.filter(
          (behavior) => behavior.facetId !== null && !isCustomBehaviorView(behavior),
        )
        const scopes = [
          {
            slug: TOPICS_BEHAVIOR_SLUG,
            name: TOPICS_BEHAVIOR_NAME,
            description: TOPICS_BEHAVIOR_DESCRIPTION,
            status: "ready" as CustomBehaviorStatus,
            customBehaviorId: null,
            facetId: null,
            viewCount: countCustomBehaviorViews(behaviors, null),
          },
          ...mainBehaviors.map((behavior) => ({
            slug: behavior.slug,
            name: behavior.name,
            description: descriptionByFacetId.get(behavior.facetId as string) ?? "",
            status: behavior.status,
            customBehaviorId: behavior.id as string,
            facetId: behavior.facetId as string,
            viewCount: countCustomBehaviorViews(behaviors, behavior.facetId),
          })),
        ]

        return yield* Effect.forEach(
          scopes,
          (scope) =>
            listProjectBehavioursUseCase({
              organizationId: orgId,
              projectId,
              sortBy: "volume",
              ...(scope.customBehaviorId ? { customBehaviorId: CustomBehaviorId(scope.customBehaviorId) } : {}),
              ...(scope.facetId ? { facetId: FacetId(scope.facetId) } : {}),
            }).pipe(
              // A behavior whose tree isn't built yet is a normal card state
              // (waiting / analyzing), never a failed catalog.
              Effect.orElseSucceed(() => ({ topics: [] as readonly ProjectBehaviourNode[] })),
              Effect.map((result): BehaviourCatalogEntryRecord => {
                // The card is a way into the tree, so it holds to the same rule the
                // tree screen does: a tree too small to render there teases nothing
                // here, and stays a waiting card instead of a link to an empty page.
                const openable = isOpenableBehaviourTree(result.topics)
                return {
                  ...scope,
                  sessionCount: openable
                    ? result.topics.reduce((sum, node) => sum + node.subtreeObservationCount, 0)
                    : 0,
                  groups: openable ? toGroupRecords(result.topics) : [],
                }
              }),
            ),
          { concurrency: 4 },
        )
      }).pipe(
        withScopedPostgres(postgresCatalogLayer, getPostgresClient(), orgId),
        withScopedClickHouse(clickHouseCatalogLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })
