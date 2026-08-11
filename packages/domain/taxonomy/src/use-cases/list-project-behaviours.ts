import {
  type CustomBehaviorId,
  type FacetId,
  type OrganizationId,
  type ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Effect, Option } from "effect"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import { isDisplayableTaxonomyName } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { TaxonomyViewAssignmentRepository } from "../ports/taxonomy-view-assignment-repository.ts"
import { classifyClusterTrend, type TaxonomyClusterTrendSummary } from "./analytics.ts"

export type BehaviourSegment = "all" | "new_this_week" | "spiking" | "high_escalation"
export type BehaviourSortBy = "category" | "volume" | "trend" | "first_seen" | "last_seen" | "escalation_rate"
export type BehaviourNovelty = "first_seen" | "spiking" | "resurfaced" | "unknown"
export type BehaviourFirstSeenLabel = "today" | "this_week" | "older"

export interface ListProjectBehavioursInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
  readonly firstSeenWindowDays?: number
  readonly trendWindowDays?: number
  readonly minObservations?: number
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly segment?: BehaviourSegment
  readonly sortBy?: BehaviourSortBy
  readonly limit?: number
  /**
   * Omit/null = global taxonomy tree. An id scopes the whole read to that
   * behavior's sub-tree: scoped clusters from Postgres and per-cluster counts +
   * start_time-windowed trend from the ClickHouse `taxonomy_view_assignments`
   * slice (never the global `taxonomy_observations.assigned_cluster_id`). Scoped
   * gardening runs on a schedule and accumulates assignments across runs with
   * stable cluster ids, so trend/novelty/spiking read the same as the global tree.
   */
  readonly customBehaviorId?: CustomBehaviorId | null
  /**
   * The behavior's facet; omit/null = the topic slice (`facet_id = ''`), a facet
   * id reads that facet's edges in the same `taxonomy_view_assignments` slice.
   */
  readonly facetId?: FacetId | null
}

/**
 * One node of the topic tree. Depth-0 nodes are the coarsest density level;
 * each level below re-clusters its parent's observations at tighter density.
 */
export interface ProjectBehaviourNode {
  readonly cluster: TaxonomyCluster
  readonly firstSeenLabel: BehaviourFirstSeenLabel
  readonly trend: TaxonomyClusterTrendSummary
  readonly novelty: BehaviourNovelty
  /** Sessions assigned to this node itself, excluding everything under it. */
  readonly directObservationCount: number
  /** Sessions represented by this node's visible subtree; aggregate parents are not double-counted. */
  readonly subtreeObservationCount: number
  readonly children: readonly ProjectBehaviourNode[]
}

export interface ListProjectBehavioursResult {
  readonly topics: readonly ProjectBehaviourNode[]
  /**
   * Sessions that reached a node the reader removed (the unwrapped root, or a
   * promoted signpost) and no group below it, so rows plus residue still sum to
   * the project total. Whether to render it as a row is a product decision.
   */
  readonly residueObservationCount: number
}

const MS_PER_DAY = 24 * 60 * 60_000
const DEFAULT_FIRST_SEEN_WINDOW_DAYS = 7
const DEFAULT_TREND_WINDOW_DAYS = 8
const DEFAULT_MIN_OBSERVATIONS = 1
const DEFAULT_LIMIT = 200
const TREND_CURRENT_DAYS = 1

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

const daysWindowStart = (now: Date, days: number): Date =>
  startOfUtcDay(new Date(now.getTime() - (days - 1) * MS_PER_DAY))

const firstSeenLabel = (firstObservedAt: Date, now: Date, firstSeenWindowDays: number): BehaviourFirstSeenLabel => {
  const todayStart = startOfUtcDay(now)
  if (firstObservedAt >= todayStart) return "today"
  if (firstObservedAt >= daysWindowStart(now, firstSeenWindowDays)) return "this_week"
  return "older"
}

const noveltyFor = (input: {
  readonly cluster: TaxonomyCluster
  readonly trend: TaxonomyClusterTrendSummary
  readonly firstSeenWindowStart: Date
  readonly minObservations: number
}): BehaviourNovelty => {
  if (input.cluster.firstObservedAt >= input.firstSeenWindowStart) return "first_seen"
  if (input.trend.status === "spike") return "spiking"
  if (input.trend.status === "new" && input.trend.currentCount >= input.minObservations) return "spiking"
  return "unknown"
}

const trendRank = (trend: TaxonomyClusterTrendSummary): number => {
  switch (trend.status) {
    case "new":
      return 6
    case "spike":
      return 5
    case "rising":
      return 4
    case "steady":
      return 3
    case "cooling":
      return 2
    case "fading":
      return 1
  }
}

const sortNodes = (nodes: readonly ProjectBehaviourNode[], sortBy: BehaviourSortBy): readonly ProjectBehaviourNode[] =>
  [...nodes].sort((a, b) => {
    switch (sortBy) {
      case "first_seen":
        return (
          b.cluster.firstObservedAt.getTime() - a.cluster.firstObservedAt.getTime() ||
          a.cluster.id.localeCompare(b.cluster.id)
        )
      case "last_seen":
        return (
          b.cluster.lastObservedAt.getTime() - a.cluster.lastObservedAt.getTime() ||
          a.cluster.id.localeCompare(b.cluster.id)
        )
      case "trend":
        return trendRank(b.trend) - trendRank(a.trend) || b.subtreeObservationCount - a.subtreeObservationCount
      case "volume":
      case "escalation_rate":
      case "category":
        return b.subtreeObservationCount - a.subtreeObservationCount || a.cluster.name.localeCompare(b.cluster.name)
    }
    return b.subtreeObservationCount - a.subtreeObservationCount || a.cluster.name.localeCompare(b.cluster.name)
  })

const countNodes = (nodes: readonly ProjectBehaviourNode[]): number =>
  nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)

export const truncateNodes = (
  nodes: readonly ProjectBehaviourNode[],
  budget: number,
): readonly ProjectBehaviourNode[] => {
  const out: ProjectBehaviourNode[] = []
  let remaining = budget
  for (const node of nodes) {
    if (remaining <= 0) break
    remaining -= 1
    const children = truncateNodes(node.children, remaining)
    remaining -= countNodes(children)
    out.push({ ...node, children })
  }
  return out
}

/**
 * Above this share of its own subtree a node holds real content; at or below it
 * the node is a signpost that exists only to bracket its children. `max(1, …)`
 * is what carries the rule on today's trees (interiors hold 0-1 sessions of
 * their own); the fraction keeps the same question meaningful on a large tree.
 */
const SCAFFOLDING_OWN_FRACTION = 0.02

const isScaffolding = (node: ProjectBehaviourNode): boolean =>
  node.directObservationCount <= Math.max(1, SCAFFOLDING_OWN_FRACTION * node.subtreeObservationCount)

interface PromoteScaffoldingResult {
  readonly nodes: readonly ProjectBehaviourNode[]
  readonly residueObservationCount: number
}

/**
 * Removes nodes that hold nothing — not nesting.
 *
 * The root goes positionally, whatever it holds: it englobes the project by
 * construction, so a content test that kept it would reintroduce the single
 * all-encompassing row this exists to prevent. A root with no children is the
 * project's only group and stays. Every other node goes only when it holds no
 * content of its own, at any depth, so an interior with real members survives
 * as a parent with its children and its count intact.
 *
 * On every tree in the fleet today each non-root interior is a signpost, so the
 * result comes out flat. That is a fact about the current builder's output, not
 * the contract — collapsing this to a leaves-only walk would return nothing for
 * a childless root, silently drop residue, and foreclose real hierarchy.
 */
export const promoteScaffolding = (rootNodes: readonly ProjectBehaviourNode[]): PromoteScaffoldingResult => {
  let residueObservationCount = 0
  const promote = (nodes: readonly ProjectBehaviourNode[]): readonly ProjectBehaviourNode[] =>
    nodes.flatMap((node) => {
      if (node.children.length === 0) return [node]
      const children = promote(node.children)
      if (!isScaffolding(node)) return [{ ...node, children }]
      residueObservationCount += node.directObservationCount
      return children
    })

  const nodes = rootNodes.flatMap((root) => {
    if (root.children.length === 0) return [root]
    residueObservationCount += root.directObservationCount
    return promote(root.children)
  })
  return { nodes, residueObservationCount }
}

export const listProjectBehavioursUseCase = (input: ListProjectBehavioursInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const firstSeenWindowDays = Math.max(input.firstSeenWindowDays ?? DEFAULT_FIRST_SEEN_WINDOW_DAYS, 1)
    const trendWindowDays = Math.max(input.trendWindowDays ?? DEFAULT_TREND_WINDOW_DAYS, 2)
    const minObservations = Math.max(input.minObservations ?? DEFAULT_MIN_OBSERVATIONS, 1)
    const segment = input.segment ?? "all"
    const sortBy = input.sortBy ?? "category"
    const limit = Math.max(input.limit ?? DEFAULT_LIMIT, 1)
    const firstSeenWindowStart = daysWindowStart(now, firstSeenWindowDays)

    const clusterRepository = yield* TaxonomyClusterRepository
    const observationRepository = yield* TaxonomyObservationRepository
    const customBehaviorId = input.customBehaviorId ?? null
    // Scoped counts live in the ClickHouse taxonomy_view_assignments slice.
    // Kept out of this use-case's required services (via serviceOption) so the
    // global Behaviours read contract is unchanged; scoped callers provide it.
    const assignmentRepositoryOption = yield* Effect.serviceOption(TaxonomyViewAssignmentRepository)
    const scopedAssignmentRepository =
      customBehaviorId != null
        ? yield* Option.match(assignmentRepositoryOption, {
            onNone: () =>
              Effect.fail(
                new RepositoryError({
                  cause: new Error("TaxonomyViewAssignmentRepository is required to read a scoped behavior tree"),
                  operation: "listProjectBehaviours.scopedAssignmentRepository",
                }),
              ),
            onSome: (repository) => Effect.succeed(repository),
          })
        : null

    const allActiveClusters = yield* clusterRepository.listActiveByProject({
      projectId: input.projectId,
      dimension,
      customBehaviorId,
      ...(input.facetId != null ? { facetId: input.facetId } : {}),
    })
    const displayable = allActiveClusters.filter((cluster) => isDisplayableTaxonomyName(cluster.name))
    const childrenByParentId = new Map<string, TaxonomyCluster[]>()
    for (const cluster of displayable) {
      if (cluster.parentClusterId === null) continue
      const siblings = childrenByParentId.get(cluster.parentClusterId) ?? []
      siblings.push(cluster)
      childrenByParentId.set(cluster.parentClusterId, siblings)
    }

    // Scoped trees read their per-cluster counts from the custom-behavior
    // assignment slice (never global observations); a global tree reads the
    // time-windowed global assignment counts.
    const assignmentCounts =
      scopedAssignmentRepository != null && customBehaviorId != null
        ? yield* scopedAssignmentRepository.getClusterAssignmentCounts({
            organizationId: input.organizationId,
            projectId: input.projectId,
            customBehaviorId,
            ...(input.facetId != null ? { facetId: input.facetId } : {}),
            ...(input.startTimeFrom ? { startTimeFrom: input.startTimeFrom } : {}),
            ...(input.startTimeTo ? { startTimeTo: input.startTimeTo } : {}),
          })
        : yield* observationRepository.getClusterAssignmentCounts({
            organizationId: input.organizationId,
            projectId: input.projectId,
            clusterIds: displayable.map((cluster) => cluster.id),
            ...(input.startTimeFrom ? { startTimeFrom: input.startTimeFrom } : {}),
            ...(input.startTimeTo ? { startTimeTo: input.startTimeTo } : {}),
          })
    const directCountByClusterId = new Map(assignmentCounts.map((count) => [count.clusterId, count.count] as const))

    // Scoped gardening accumulates rows across runs (no truncate) and keeps
    // stable cluster ids via the Hungarian lineage matcher, so the same
    // start_time-windowed born/continue/die trend the global tree derives is
    // computable over the taxonomy_view_assignments slice.
    const currentSince = new Date(now.getTime() - TREND_CURRENT_DAYS * MS_PER_DAY)
    const baselineSince = new Date(now.getTime() - trendWindowDays * MS_PER_DAY)
    const baselineDays = Math.max(trendWindowDays - TREND_CURRENT_DAYS, 1)
    const trendCounts =
      scopedAssignmentRepository != null && customBehaviorId != null
        ? yield* scopedAssignmentRepository.getClusterTrendCounts({
            organizationId: input.organizationId,
            projectId: input.projectId,
            customBehaviorId,
            ...(input.facetId != null ? { facetId: input.facetId } : {}),
            clusterIds: displayable.map((cluster) => cluster.id),
            currentSince,
            baselineSince,
            baselineDays,
          })
        : yield* observationRepository.getClusterTrendCounts({
            organizationId: input.organizationId,
            projectId: input.projectId,
            clusterIds: displayable.map((cluster) => cluster.id),
            currentSince,
            baselineSince,
            baselineDays,
          })
    const trendByClusterId = new Map(
      trendCounts.map((trend) => [trend.clusterId, classifyClusterTrend(trend)] as const),
    )

    // A node is shown on its own merit (enough direct observations and a
    // segment match) or as scaffolding for surviving children — interior
    // nodes whose observations moved into children keep naming the subtree.
    const buildNode = (cluster: TaxonomyCluster): ProjectBehaviourNode | null => {
      const children = sortNodes(
        (childrenByParentId.get(cluster.id) ?? []).flatMap((child) => {
          const node = buildNode(child)
          return node === null ? [] : [node]
        }),
        sortBy,
      )
      // Zero-observation nodes get no trend row from ClickHouse; an interior
      // node whose members all moved into children must still scaffold them.
      const trend =
        trendByClusterId.get(cluster.id) ??
        classifyClusterTrend({
          currentCount: 0,
          baselineCount: 0,
          baselineDays: Math.max(trendWindowDays - TREND_CURRENT_DAYS, 1),
        })
      const novelty = noveltyFor({ cluster, trend, firstSeenWindowStart, minObservations })
      const directObservationCount = directCountByClusterId.get(cluster.id) ?? 0
      const subtreeObservationCount =
        directObservationCount + children.reduce((sum, child) => sum + child.subtreeObservationCount, 0)
      const ownVisible =
        subtreeObservationCount >= minObservations &&
        (segment === "all" ||
          (segment === "new_this_week" && novelty === "first_seen") ||
          (segment === "spiking" && novelty === "spiking"))
      if (!ownVisible && children.length === 0) return null
      return {
        cluster,
        firstSeenLabel: firstSeenLabel(cluster.firstObservedAt, now, firstSeenWindowDays),
        trend,
        novelty,
        directObservationCount,
        // UI session counts come from current observation assignments in the
        // selected time range. Interior nodes are aggregates, so their count is
        // their own members plus their visible descendants rather than their
        // stored all-time Postgres counter.
        subtreeObservationCount,
        children,
      }
    }

    const rootNodes = displayable
      .filter((cluster) => cluster.parentClusterId === null)
      .flatMap((cluster) => {
        const node = buildNode(cluster)
        return node === null ? [] : [node]
      })

    // Promotion runs on the already-filtered tree so `ownVisible` decides which
    // nodes exist first, and before truncation so the node budget is spent on
    // real groups instead of scaffolding.
    const { nodes: promoted, residueObservationCount } = promoteScaffolding(rootNodes)
    const topics = sortNodes(promoted, sortBy)

    return {
      topics: truncateNodes(topics, limit),
      residueObservationCount,
    } satisfies ListProjectBehavioursResult
  }).pipe(Effect.withSpan("taxonomy.listProjectBehaviours"))
