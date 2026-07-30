import { MOMENT_KINDS, type MomentKind } from "@domain/conversation-intelligence"
import { CustomBehaviorId, FacetId, normalizeCentroid, ProjectId, TaxonomyClusterId } from "@domain/shared"
import {
  type ClusterAnalysisAggregate,
  getBehaviourTrajectoryUseCase,
  getClusterSessionIntelligenceUseCase,
  isDisplayableTaxonomyName,
  listBehaviourSessionsUseCase,
  listProjectBehavioursUseCase,
  type ProjectBehaviourNode,
  type TaxonomyCluster,
  TaxonomyClusterIntelligenceRepository,
  TaxonomyClusterRepository,
  type TaxonomyClusterTrendSummary,
} from "@domain/taxonomy"
import {
  TaxonomyClusterIntelligenceRepositoryLive,
  TaxonomyObservationRepositoryLive,
  TaxonomyViewAssignmentRepositoryLive,
} from "@platform/db-clickhouse"
import { TaxonomyClusterRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"
import { isOpenableBehaviourTree } from "./behaviour-tree-visibility.ts"
import { type CentroidPoint2D, projectCentroidsTo2D } from "./centroid-projection.ts"

export interface TaxonomyClusterRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly parentClusterId: string | null
  readonly depth: number
  readonly name: string
  readonly description: string
  readonly observationCount: number
  readonly state: TaxonomyCluster["state"]
  readonly firstObservedAt: string
  readonly lastObservedAt: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface BehaviourSignalRecord {
  readonly kind: string
  readonly rate: number
}

export interface BehaviourIntelligenceSummaryRecord {
  readonly sourceAnalysisCoverage: number | null
  readonly resolutionRate: number | null
  readonly escalationRate: number | null
  readonly abandonmentRate: number | null
  readonly frustrationRate: number | null
  /** Every detected moment signal in the cluster's source sessions, by rate. */
  readonly signals: readonly BehaviourSignalRecord[]
}

export interface BehaviourNodeRecord {
  readonly cluster: TaxonomyClusterRecord
  readonly firstSeenLabel: ProjectBehaviourNode["firstSeenLabel"]
  readonly trend: TaxonomyClusterTrendSummary
  readonly novelty: ProjectBehaviourNode["novelty"]
  /** Sessions represented by this node in the selected time range, rolled up from visible descendants. */
  readonly subtreeSessionCount: number
  /** Own session-intelligence aggregate rolled up with descendants. */
  readonly intelligence: BehaviourIntelligenceSummaryRecord
  /**
   * Cluster centroid projected to 2D (PCA over every cluster in the
   * project, normalized to [0,1] per axis). Null when the centroid is
   * empty or its embedding model mismatches the project majority.
   */
  readonly position: CentroidPoint2D | null
  readonly children: readonly BehaviourNodeRecord[]
}

interface ProjectBehavioursRecord {
  readonly topics: readonly BehaviourNodeRecord[]
}

export interface BehaviourTimeRangeRecord {
  readonly fromIso?: string | undefined
  readonly toIso?: string | undefined
}

export type BehaviourSessionFilter = "all" | MomentKind
export type BehaviourTrajectoryMetric = "frequency" | "escalation" | "resolution" | "churnRisk" | "wins"

export interface BehaviourMomentRangeRecord {
  readonly metric: BehaviourTrajectoryMetric
  readonly fromTurn: number
  readonly toTurn: number
}

export interface BehaviourSessionRecord {
  readonly sessionId: string
  readonly traceId: string
  /** First semantic moment that linked this session to the topic cluster. */
  readonly momentId: string
  readonly summary: string
  readonly startTime: string
  readonly endTime: string
  readonly momentKinds: readonly string[]
}

export type BehaviourTrajectoryAxis = "day" | "turn"

interface BehaviourTrajectoryRowRecord {
  readonly categoryClusterId: string
  readonly bucket: string
  readonly frequency: number
  readonly escalation: number
  readonly resolution: number
  readonly churnRisk: number
  readonly wins: number
  readonly maxLastMessageIndex: number
  readonly maxEscalationLastMessageIndex: number
  readonly maxResolutionLastMessageIndex: number
  readonly maxChurnRiskLastMessageIndex: number
  readonly maxWinsLastMessageIndex: number
}

interface BehaviourTrajectoryRecord {
  readonly buckets: readonly string[]
  readonly rows: readonly BehaviourTrajectoryRowRecord[]
}

interface BehaviourSessionHistogramBucketRecord {
  readonly startTime: string
  readonly count: number
}

interface BehaviourSessionsRecord {
  readonly sessions: readonly BehaviourSessionRecord[]
  readonly hasMore: boolean
  readonly nextOffset: number | null
  readonly histogram: readonly BehaviourSessionHistogramBucketRecord[]
}

interface ClusterSessionIntelligenceRecord {
  readonly rates: {
    readonly analysisCoverage: number
    readonly resolutionRate: number
    readonly escalationRate: number
    readonly frustrationRate: number
  }
  readonly topMoments: readonly { readonly kind: string; readonly count: number }[]
  readonly representativeExamples: readonly Record<string, string>[]
}

const behaviourTimeRangeSchema = z
  .object({
    fromIso: z.string().optional(),
    toIso: z.string().optional(),
  })
  .optional()

const behaviourTrajectoryMetricSchema = z.enum(["frequency", "escalation", "resolution", "churnRisk", "wins"])

const behaviourMomentRangeSchema = z
  .object({
    metric: behaviourTrajectoryMetricSchema,
    fromTurn: z.number().int().min(0),
    toTurn: z.number().int().min(0),
  })
  .refine((range) => range.toTurn >= range.fromTurn, "toTurn must be greater than or equal to fromTurn")
  .optional()

const parseBehaviourTimeRange = (timeRange: BehaviourTimeRangeRecord | undefined) => ({
  from: timeRange?.fromIso ? new Date(timeRange.fromIso) : undefined,
  to: timeRange?.toIso ? new Date(timeRange.toIso) : undefined,
})

const clickHouseTaxonomyIntelligenceLayer = Layer.mergeAll(
  TaxonomyObservationRepositoryLive,
  TaxonomyClusterIntelligenceRepositoryLive,
  // Provides scoped per-cluster counts to listProjectBehavioursUseCase when a
  // customBehaviorId is passed; unused (never resolved) on the global path.
  TaxonomyViewAssignmentRepositoryLive,
)

const postgresTaxonomyReadLayer = Layer.mergeAll(TaxonomyClusterRepositoryLive)

const toClusterRecord = (cluster: TaxonomyCluster): TaxonomyClusterRecord => ({
  id: cluster.id,
  organizationId: cluster.organizationId,
  projectId: cluster.projectId,
  parentClusterId: cluster.parentClusterId,
  depth: cluster.depth,
  name: cluster.name,
  description: cluster.description,
  observationCount: cluster.observationCount,
  state: cluster.state,
  firstObservedAt: cluster.firstObservedAt.toISOString(),
  lastObservedAt: cluster.lastObservedAt.toISOString(),
  createdAt: cluster.createdAt.toISOString(),
  updatedAt: cluster.updatedAt.toISOString(),
})

const emptyBehaviourIntelligence = (): BehaviourIntelligenceSummaryRecord => ({
  sourceAnalysisCoverage: null,
  resolutionRate: null,
  escalationRate: null,
  abandonmentRate: null,
  frustrationRate: null,
  signals: [],
})

const rateFromDistribution = (
  distribution: Readonly<Record<string, number>>,
  key: string,
  denominator: number,
): number | null => (denominator > 0 ? (distribution[key] ?? 0) / denominator : null)

const signalsFromDistribution = (
  distribution: Readonly<Record<string, number>>,
  denominator: number,
): readonly BehaviourSignalRecord[] =>
  denominator <= 0
    ? []
    : Object.entries(distribution)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => ({ kind, rate: count / denominator }))
        .sort((a, b) => b.rate - a.rate)

const intelligenceFromAggregate = (aggregate: ClusterAnalysisAggregate | null): BehaviourIntelligenceSummaryRecord => {
  if (!aggregate) return emptyBehaviourIntelligence()
  const denominator = aggregate.eligibleSessionCount
  return {
    sourceAnalysisCoverage: aggregate.sourceAnalysisCoverage,
    resolutionRate: rateFromDistribution(aggregate.momentKindDistribution, "resolution", denominator),
    escalationRate: rateFromDistribution(aggregate.momentKindDistribution, "escalation", denominator),
    abandonmentRate: rateFromDistribution(aggregate.momentKindDistribution, "abandonment", denominator),
    frustrationRate: rateFromDistribution(aggregate.momentKindDistribution, "user_frustration", denominator),
    signals: signalsFromDistribution(aggregate.momentKindDistribution, denominator),
  }
}

const flattenNodes = (nodes: readonly ProjectBehaviourNode[]): readonly ProjectBehaviourNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children)])

interface WeightedIntelligence {
  readonly intelligence: BehaviourIntelligenceSummaryRecord
  readonly weight: number
}

const weightedAverageRate = (
  entries: readonly WeightedIntelligence[],
  key: keyof BehaviourIntelligenceSummaryRecord,
): number | null => {
  const values = entries
    .map((entry) => ({ value: entry.intelligence[key], weight: entry.weight }))
    .filter((entry): entry is { readonly value: number; readonly weight: number } => typeof entry.value === "number")
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0)
  return totalWeight === 0 ? null : values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight
}

const weightedAverageSignals = (entries: readonly WeightedIntelligence[]): readonly BehaviourSignalRecord[] => {
  const totals = new Map<string, number>()
  let totalWeight = 0
  for (const entry of entries) {
    if (entry.intelligence.sourceAnalysisCoverage === null) continue
    totalWeight += entry.weight
    for (const signal of entry.intelligence.signals) {
      totals.set(signal.kind, (totals.get(signal.kind) ?? 0) + signal.rate * entry.weight)
    }
  }
  if (totalWeight === 0) return []
  return [...totals.entries()].map(([kind, sum]) => ({ kind, rate: sum / totalWeight })).sort((a, b) => b.rate - a.rate)
}

/**
 * "High escalation" is resolved here, not in the domain use-case: escalation
 * rates come from the ClickHouse intelligence rollup computed in this layer.
 * A node qualifies on its own subtree rate or as scaffolding for a child
 * that does.
 */
const HIGH_ESCALATION_MIN_RATE = 0.2

const pruneToHighEscalation = (nodes: readonly BehaviourNodeRecord[]): readonly BehaviourNodeRecord[] =>
  nodes.flatMap((node) => {
    const children = pruneToHighEscalation(node.children)
    const escalationRate = node.intelligence.escalationRate ?? 0
    if (escalationRate < HIGH_ESCALATION_MIN_RATE && children.length === 0) return []
    return [{ ...node, children }]
  })

const toBehaviourNodeRecord = (
  node: ProjectBehaviourNode,
  aggregatesByClusterId: ReadonlyMap<string, ClusterAnalysisAggregate>,
  positionsByClusterId: ReadonlyMap<string, CentroidPoint2D>,
): BehaviourNodeRecord => {
  const children = node.children.map((child) =>
    toBehaviourNodeRecord(child, aggregatesByClusterId, positionsByClusterId),
  )
  // Roll the node's own aggregate up with its subtree so interior nodes
  // (whose observations mostly live on descendants) stay representative.
  const ownAggregate = aggregatesByClusterId.get(node.cluster.id) ?? null
  const subtree: WeightedIntelligence[] = [
    {
      intelligence: intelligenceFromAggregate(ownAggregate),
      // Weight the node's own intelligence by its direct sessions in the
      // selected time range. Aggregate parents often have an all-time stored
      // subtree count but zero direct current assignments; using the stored
      // counter here would dilute child signal rates in the behaviours table.
      weight: ownAggregate?.sourceSessionCount ?? 0,
    },
    ...children.map((child) => ({ intelligence: child.intelligence, weight: child.subtreeSessionCount })),
  ]
  return {
    cluster: toClusterRecord(node.cluster),
    firstSeenLabel: node.firstSeenLabel,
    trend: node.trend,
    novelty: node.novelty,
    subtreeSessionCount: node.subtreeObservationCount,
    intelligence: {
      sourceAnalysisCoverage: weightedAverageRate(subtree, "sourceAnalysisCoverage"),
      resolutionRate: weightedAverageRate(subtree, "resolutionRate"),
      escalationRate: weightedAverageRate(subtree, "escalationRate"),
      abandonmentRate: weightedAverageRate(subtree, "abandonmentRate"),
      frustrationRate: weightedAverageRate(subtree, "frustrationRate"),
      signals: weightedAverageSignals(subtree),
    },
    position: positionsByClusterId.get(node.cluster.id) ?? null,
    children,
  }
}

interface TopicFilterOptionRecord {
  readonly id: string
  readonly name: string
  readonly depth: number
}

/**
 * Flat depth-first topic list for filter dropdowns: every active displayable
 * tree node, parents before children, ordered by subtree volume.
 */
export const getTopicFilterOptions = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly TopicFilterOptionRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const clusters = yield* TaxonomyClusterRepository
        const active = (yield* clusters.listActiveByProject({ projectId, dimension: "topic" })).filter((cluster) =>
          isDisplayableTaxonomyName(cluster.name),
        )
        const childrenByParent = new Map<string, typeof active>()
        for (const cluster of active) {
          if (cluster.parentClusterId === null) continue
          const siblings = childrenByParent.get(cluster.parentClusterId) ?? []
          siblings.push(cluster)
          childrenByParent.set(cluster.parentClusterId, siblings)
        }
        const out: TopicFilterOptionRecord[] = []
        const walk = (nodes: typeof active) => {
          for (const node of [...nodes].sort((a, b) => b.observationCount - a.observationCount)) {
            out.push({ id: node.id, name: node.name, depth: node.depth })
            walk(childrenByParent.get(node.id) ?? [])
          }
        }
        // The divisive build always produces a single root that englobes the
        // whole project — filtering by it means "everything", so it is a
        // useless option. When it is the only root and it has children, start
        // the option list from its depth-1 children (mirrors the behaviours
        // table). A single childless root still surfaces as the only option.
        const roots = active.filter((cluster) => cluster.parentClusterId === null)
        const rootChildren = roots.length === 1 && roots[0] ? (childrenByParent.get(roots[0].id) ?? []) : []
        walk(roots.length === 1 && rootChildren.length > 0 ? rootChildren : roots)
        return out
      }).pipe(withScopedPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId), withTracing),
    )
  })

export const getProjectBehaviours = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      dimension: z.enum(["topic"]).optional(),
      segment: z.enum(["all", "new_this_week", "spiking", "high_escalation"]).optional(),
      sortBy: z.enum(["category", "volume", "trend", "first_seen", "last_seen", "escalation_rate"]).optional(),
      minObservations: z.number().int().positive().optional(),
      limit: z.number().int().positive().max(500).optional(),
      timeRange: behaviourTimeRangeSchema,
      customBehaviorId: z.string().optional(),
      facetId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ProjectBehavioursRecord> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const timeRange = parseBehaviourTimeRange(data.timeRange)

    return Effect.runPromise(
      Effect.gen(function* () {
        const result = yield* listProjectBehavioursUseCase({
          organizationId: orgId,
          projectId,
          ...(data.customBehaviorId ? { customBehaviorId: CustomBehaviorId(data.customBehaviorId) } : {}),
          ...(data.facetId ? { facetId: FacetId(data.facetId) } : {}),
          ...(data.dimension ? { dimension: data.dimension } : {}),
          // high_escalation filters on intelligence rollups below, after the
          // tree and aggregates are loaded; the domain use-case has no
          // escalation data. Truncation must not run before that filter —
          // high-escalation topics are often low-volume and would be cut by
          // the volume-ranked default limit, so the segment lifts the limit.
          ...(data.segment && data.segment !== "high_escalation" ? { segment: data.segment } : {}),
          ...(data.sortBy ? { sortBy: data.sortBy } : {}),
          ...(data.minObservations ? { minObservations: data.minObservations } : {}),
          ...(timeRange.from ? { startTimeFrom: timeRange.from } : {}),
          ...(timeRange.to ? { startTimeTo: timeRange.to } : {}),
          ...(data.limit ? { limit: data.limit } : data.segment === "high_escalation" ? { limit: 500 } : {}),
        })
        const nodes = flattenNodes(result.topics)
        const intelligence = yield* TaxonomyClusterIntelligenceRepository
        const sourceWindowEnd = timeRange.to ?? new Date()
        const sourceWindowStart = timeRange.from ?? new Date(0)
        const aggregateEntries = yield* Effect.forEach(
          nodes,
          (node) =>
            intelligence
              .getClusterAggregate({
                organizationId: orgId,
                projectId,
                // Own aggregate only: the subtree rollup happens in the
                // record mapping, weighted by each node's direct sessions.
                clusterIds: [TaxonomyClusterId(node.cluster.id)],
                sourceWindowStart,
                sourceWindowEnd,
                ...(data.customBehaviorId ? { customBehaviorId: CustomBehaviorId(data.customBehaviorId) } : {}),
                ...(data.facetId ? { facetId: FacetId(data.facetId) } : {}),
              })
              .pipe(Effect.map((aggregate) => [node.cluster.id, aggregate] as const)),
          { concurrency: 6 },
        )
        const aggregatesByClusterId = new Map<string, ClusterAnalysisAggregate>(aggregateEntries)
        // One PCA over every cluster in the tree so parent and child
        // positions live in the same 2D space and stay mutually comparable.
        const positionsByClusterId = projectCentroidsTo2D(
          new Map(nodes.map((node) => [node.cluster.id, normalizeCentroid(node.cluster.centroid)])),
        )
        const topics = result.topics.map((topic) =>
          toBehaviourNodeRecord(topic, aggregatesByClusterId, positionsByClusterId),
        )
        const displayTopics = data.segment === "high_escalation" ? pruneToHighEscalation(topics) : topics
        return { topics: isOpenableBehaviourTree(displayTopics) ? displayTopics : [] }
      }).pipe(
        withScopedPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId),
        withScopedClickHouse(clickHouseTaxonomyIntelligenceLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

export const getBehaviourTrajectory = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      categoryClusterIds: z.array(z.string()).max(100),
      axis: z.enum(["day", "turn"]),
      timeRange: behaviourTimeRangeSchema,
      customBehaviorId: z.string().optional(),
      facetId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<BehaviourTrajectoryRecord> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const timeRange = parseBehaviourTimeRange(data.timeRange)
    const categoryClusterIds = [...new Set(data.categoryClusterIds)].filter((id) => id.length > 0)
    if (categoryClusterIds.length === 0) return { buckets: [], rows: [] }

    return Effect.runPromise(
      getBehaviourTrajectoryUseCase({
        organizationId: orgId,
        projectId,
        categoryClusterIds: categoryClusterIds.map((id) => TaxonomyClusterId(id)),
        axis: data.axis,
        ...(timeRange.from ? { startTimeFrom: timeRange.from } : {}),
        ...(timeRange.to ? { startTimeTo: timeRange.to } : {}),
        ...(data.customBehaviorId ? { customBehaviorId: CustomBehaviorId(data.customBehaviorId) } : {}),
        ...(data.facetId ? { facetId: FacetId(data.facetId) } : {}),
      }).pipe(
        withScopedPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId),
        withScopedClickHouse(clickHouseTaxonomyIntelligenceLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

export const getBehaviourSessions = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      clusterId: z.string(),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      filter: z.enum(["all", ...MOMENT_KINDS]).optional(),
      timeRange: behaviourTimeRangeSchema,
      momentRange: behaviourMomentRangeSchema,
      customBehaviorId: z.string().optional(),
      facetId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<BehaviourSessionsRecord> => {
    const orgId = await resolveOrgScope(context)
    const timeRange = parseBehaviourTimeRange(data.timeRange)

    const page = await Effect.runPromise(
      listBehaviourSessionsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        clusterId: TaxonomyClusterId(data.clusterId),
        filter: data.filter ?? "all",
        ...(data.momentRange ? { momentRange: data.momentRange } : {}),
        ...(timeRange.from ? { startTimeFrom: timeRange.from } : {}),
        ...(timeRange.to ? { startTimeTo: timeRange.to } : {}),
        offset: data.offset ?? 0,
        limit: data.limit ?? 50,
        ...(data.customBehaviorId ? { customBehaviorId: CustomBehaviorId(data.customBehaviorId) } : {}),
        ...(data.facetId ? { facetId: FacetId(data.facetId) } : {}),
      }).pipe(
        withScopedPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId),
        withScopedClickHouse(clickHouseTaxonomyIntelligenceLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )

    return {
      sessions: page.sessions.map((session) => ({
        sessionId: session.sessionId,
        traceId: session.traceId,
        momentId: session.momentId,
        summary: session.summary,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime.toISOString(),
        momentKinds: session.momentKinds,
      })),
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
      histogram: page.histogram.map((bucket) => ({
        startTime: bucket.startTime.toISOString(),
        count: bucket.count,
      })),
    }
  })

export const getClusterProfile = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      clusterId: z.string(),
      timeRange: behaviourTimeRangeSchema,
      customBehaviorId: z.string().optional(),
      facetId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ClusterSessionIntelligenceRecord> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const timeRange = parseBehaviourTimeRange(data.timeRange)

    return Effect.runPromise(
      getClusterSessionIntelligenceUseCase({
        organizationId: orgId,
        projectId,
        clusterId: TaxonomyClusterId(data.clusterId),
        sourceWindowStart: timeRange.from ?? new Date(0),
        sourceWindowEnd: timeRange.to ?? new Date(),
        ...(data.customBehaviorId ? { customBehaviorId: CustomBehaviorId(data.customBehaviorId) } : {}),
        ...(data.facetId ? { facetId: FacetId(data.facetId) } : {}),
      }).pipe(
        Effect.map((result) => ({
          rates: result.rates,
          topMoments: result.topMoments,
          representativeExamples: result.representativeExamples.map((example) =>
            Object.fromEntries(Object.entries(example).map(([key, value]) => [key, String(value)])),
          ),
        })),
        withScopedPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId),
        withScopedClickHouse(clickHouseTaxonomyIntelligenceLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })
