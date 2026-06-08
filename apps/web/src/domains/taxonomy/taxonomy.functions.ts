import { MOMENT_KINDS, type MomentKind } from "@domain/conversation-intelligence"
import { normalizeCentroid, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import {
  type ClusterAnalysisAggregate,
  getClusterSessionIntelligenceUseCase,
  isDisplayableTaxonomyName,
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
  withClickHouse,
} from "@platform/db-clickhouse"
import { TaxonomyClusterRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
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

const parseBehaviourTimeRange = (timeRange: BehaviourTimeRangeRecord | undefined) => ({
  from: timeRange?.fromIso ? new Date(timeRange.fromIso) : undefined,
  to: timeRange?.toIso ? new Date(timeRange.toIso) : undefined,
})

const clickHouseTaxonomyIntelligenceLayer = Layer.mergeAll(
  TaxonomyObservationRepositoryLive,
  TaxonomyClusterIntelligenceRepositoryLive,
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
  .handler(async ({ data }): Promise<readonly TopicFilterOptionRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
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
        walk(active.filter((cluster) => cluster.parentClusterId === null))
        return out
      }).pipe(withPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId), withTracing),
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
    }),
  )
  .handler(async ({ data }): Promise<ProjectBehavioursRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const timeRange = parseBehaviourTimeRange(data.timeRange)

    return Effect.runPromise(
      Effect.gen(function* () {
        const result = yield* listProjectBehavioursUseCase({
          organizationId: orgId,
          projectId,
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
        return { topics: data.segment === "high_escalation" ? pruneToHighEscalation(topics) : topics }
      }).pipe(
        withPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId),
        withClickHouse(clickHouseTaxonomyIntelligenceLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

const trajectoryBucketExpression = (axis: BehaviourTrajectoryAxis) =>
  axis === "day" ? "toString(toDate(cs.startTime))" : "toString(m.first_message_index)"

const parseTrajectoryNumber = (value: unknown): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

export const getBehaviourTrajectory = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      categoryClusterIds: z.array(z.string()).max(100),
      axis: z.enum(["day", "turn"]),
      timeRange: behaviourTimeRangeSchema,
    }),
  )
  .handler(async ({ data }): Promise<BehaviourTrajectoryRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const timeRange = parseBehaviourTimeRange(data.timeRange)
    const categoryClusterIds = [...new Set(data.categoryClusterIds)].filter((id) => id.length > 0)
    if (categoryClusterIds.length === 0) return { buckets: [], rows: [] }

    const subtreeEntries = await Effect.runPromise(
      Effect.gen(function* () {
        const clusters = yield* TaxonomyClusterRepository
        return yield* Effect.forEach(
          categoryClusterIds,
          (clusterId) =>
            clusters
              .listSubtreeIds({ projectId, clusterId: TaxonomyClusterId(clusterId) })
              .pipe(Effect.map((clusterIds) => [clusterId, clusterIds] as const)),
          { concurrency: 6 },
        )
      }).pipe(withPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId), withTracing),
    )

    const bucketExpression = trajectoryBucketExpression(data.axis)
    const timeFromClause = timeRange.from ? "AND o.start_time >= {startTimeFrom:DateTime64(9, 'UTC')}" : ""
    const timeToClause = timeRange.to ? "AND o.start_time < {startTimeTo:DateTime64(9, 'UTC')}" : ""
    const clickhouse = getClickhouseClient()
    const rowsByCategory = await Promise.all(
      subtreeEntries.map(async ([categoryClusterId, clusterIds]) => {
        const result = await clickhouse.query({
          query: `
            WITH latest_analyses AS (
              SELECT organization_id, project_id, session_id, analysis_hash
              FROM session_analyses FINAL
              WHERE organization_id = {organizationId:String}
                AND project_id = {projectId:String}
            ),
            cluster_sessions AS (
              SELECT
                o.organization_id AS organization_id,
                o.project_id AS project_id,
                o.session_id AS session_id,
                any(a.analysis_hash) AS analysisHash,
                min(o.start_time) AS startTime
              FROM taxonomy_observations AS o FINAL
              INNER JOIN latest_analyses AS a
                ON o.organization_id = a.organization_id
               AND o.project_id = a.project_id
               AND o.session_id = a.session_id
               AND o.analysis_hash = a.analysis_hash
              WHERE o.organization_id = {organizationId:String}
                AND o.project_id = {projectId:String}
                AND o.assigned_cluster_id IN {clusterIds:Array(String)}
                ${timeFromClause}
                ${timeToClause}
              GROUP BY o.organization_id, o.project_id, o.session_id
            )
            SELECT
              ${bucketExpression} AS bucket,
              count() AS frequency,
              countIf(m.kind = 'escalation') AS escalation,
              countIf(m.kind = 'resolution') AS resolution,
              countIf(m.kind IN ('abandonment', 'user_frustration')) AS churnRisk,
              countIf(m.kind IN ('resolution', 'user_satisfaction')) AS wins,
              max(m.last_message_index) AS maxLastMessageIndex,
              maxIf(m.last_message_index, m.kind = 'escalation') AS maxEscalationLastMessageIndex,
              maxIf(m.last_message_index, m.kind = 'resolution') AS maxResolutionLastMessageIndex,
              maxIf(m.last_message_index, m.kind IN ('abandonment', 'user_frustration')) AS maxChurnRiskLastMessageIndex,
              maxIf(m.last_message_index, m.kind IN ('resolution', 'user_satisfaction')) AS maxWinsLastMessageIndex
            FROM cluster_sessions AS cs
            INNER JOIN session_moment_labels AS m FINAL
              ON cs.organization_id = m.organization_id
             AND cs.project_id = m.project_id
             AND cs.session_id = m.session_id
             AND cs.analysisHash = m.analysis_hash
            GROUP BY bucket
            ORDER BY ${data.axis === "day" ? "bucket ASC" : "toUInt16(bucket) ASC"}
          `,
          query_params: {
            organizationId,
            projectId: data.projectId,
            clusterIds,
            axis: data.axis,
            ...(timeRange.from ? { startTimeFrom: timeRange.from.toISOString().replace("Z", "") } : {}),
            ...(timeRange.to ? { startTimeTo: timeRange.to.toISOString().replace("Z", "") } : {}),
          },
          format: "JSONEachRow",
        })
        const rows = (await result.json()) as Array<{
          readonly bucket: string
          readonly frequency: number | string
          readonly escalation: number | string
          readonly resolution: number | string
          readonly churnRisk: number | string
          readonly wins: number | string
          readonly maxLastMessageIndex: number | string
          readonly maxEscalationLastMessageIndex: number | string
          readonly maxResolutionLastMessageIndex: number | string
          readonly maxChurnRiskLastMessageIndex: number | string
          readonly maxWinsLastMessageIndex: number | string
        }>
        return rows.map((row) => ({
          categoryClusterId,
          bucket: row.bucket,
          frequency: parseTrajectoryNumber(row.frequency),
          escalation: parseTrajectoryNumber(row.escalation),
          resolution: parseTrajectoryNumber(row.resolution),
          churnRisk: parseTrajectoryNumber(row.churnRisk),
          wins: parseTrajectoryNumber(row.wins),
          maxLastMessageIndex: parseTrajectoryNumber(row.maxLastMessageIndex),
          maxEscalationLastMessageIndex: parseTrajectoryNumber(row.maxEscalationLastMessageIndex),
          maxResolutionLastMessageIndex: parseTrajectoryNumber(row.maxResolutionLastMessageIndex),
          maxChurnRiskLastMessageIndex: parseTrajectoryNumber(row.maxChurnRiskLastMessageIndex),
          maxWinsLastMessageIndex: parseTrajectoryNumber(row.maxWinsLastMessageIndex),
        }))
      }),
    )

    const rows = rowsByCategory.flat()
    const buckets = [...new Set(rows.map((row) => row.bucket))].sort((left, right) =>
      data.axis === "day" ? left.localeCompare(right) : Number(left) - Number(right),
    )
    return { buckets, rows }
  })

const behaviourSessionFilterMatches = (session: BehaviourSessionRecord, filter: BehaviourSessionFilter) => {
  if (filter === "all") return true
  if (filter === "resolution") return session.momentKinds.includes("resolution")
  if (filter === "abandonment") return session.momentKinds.includes("abandonment")
  return session.momentKinds.includes(filter)
}

const behaviourSessionFilterSql = `
  ({filter:String} = 'all'
    OR ({filter:String} = 'resolution' AND has(momentKinds, 'resolution'))
    OR ({filter:String} = 'abandonment' AND has(momentKinds, 'abandonment'))
    OR ({filter:String} NOT IN ('all', 'resolution', 'abandonment') AND has(momentKinds, {filter:String})))
`

// Observations are pinned to each session's CURRENT analysis: superseded
// analysis generations are never deleted, so an unscoped read unions every
// re-analysis and \`any(analysis_hash)\` could pick a stale hash, breaking the
// trace link and silently dropping every moment label.
const behaviourClusterSessionsCte = (timeFromClause = "", timeToClause = "") => `
  WITH latest_analyses AS (
    SELECT organization_id, project_id, session_id, analysis_hash, trace_ids
    FROM session_analyses FINAL
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
  ),
  cluster_sessions AS (
    SELECT
      o.organization_id AS organization_id,
      o.project_id AS project_id,
      o.session_id AS session_id,
      any(a.analysis_hash) AS analysisHash,
      arrayElement(any(a.trace_ids), 1) AS traceId,
      argMin(o.moment_id, o.start_time) AS momentId,
      any(JSONExtractString(o.projection_metadata, 'summary')) AS summary,
      min(o.start_time) AS startTime,
      max(o.end_time) AS endTime
    FROM taxonomy_observations AS o FINAL
    INNER JOIN latest_analyses AS a
      ON o.organization_id = a.organization_id
     AND o.project_id = a.project_id
     AND o.session_id = a.session_id
     AND o.analysis_hash = a.analysis_hash
    WHERE o.organization_id = {organizationId:String}
      AND o.project_id = {projectId:String}
      AND o.assigned_cluster_id IN {clusterIds:Array(String)}
      ${timeFromClause}
      ${timeToClause}
    GROUP BY o.organization_id, o.project_id, o.session_id
  ),
  enriched_sessions AS (
    SELECT
      cs.session_id AS sessionId,
      any(cs.traceId) AS traceId,
      any(cs.momentId) AS momentId,
      any(cs.summary) AS summary,
      any(cs.startTime) AS startTime,
      any(cs.endTime) AS endTime,
      groupUniqArrayIf(m.kind, m.kind != '') AS momentKinds
    FROM cluster_sessions AS cs
    LEFT JOIN session_moment_labels AS m FINAL
      ON cs.organization_id = m.organization_id
     AND cs.project_id = m.project_id
     AND cs.session_id = m.session_id
     AND cs.analysisHash = m.analysis_hash
    GROUP BY cs.session_id
  )
`

export const getBehaviourSessions = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      clusterId: z.string(),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      filter: z.enum(["all", ...MOMENT_KINDS]).optional(),
      timeRange: behaviourTimeRangeSchema,
    }),
  )
  .handler(async ({ data }): Promise<BehaviourSessionsRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const offset = data.offset ?? 0
    const limit = data.limit ?? 50
    const filter = data.filter ?? "all"
    const timeRange = parseBehaviourTimeRange(data.timeRange)
    // Tree node: sessions assigned anywhere in its subtree belong to it.
    const clusterIds = await Effect.runPromise(
      Effect.gen(function* () {
        const clusters = yield* TaxonomyClusterRepository
        return yield* clusters.listSubtreeIds({
          projectId: ProjectId(data.projectId),
          clusterId: TaxonomyClusterId(data.clusterId),
        })
      }).pipe(withPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId), withTracing),
    )
    const timeFromClause = timeRange.from ? "AND o.start_time >= {startTimeFrom:DateTime64(9, 'UTC')}" : ""
    const timeToClause = timeRange.to ? "AND o.start_time < {startTimeTo:DateTime64(9, 'UTC')}" : ""
    const timeQueryParams = {
      ...(timeRange.from ? { startTimeFrom: timeRange.from.toISOString().replace("Z", "") } : {}),
      ...(timeRange.to ? { startTimeTo: timeRange.to.toISOString().replace("Z", "") } : {}),
    }
    const result = await getClickhouseClient().query({
      query: `${behaviourClusterSessionsCte(timeFromClause, timeToClause)}
              SELECT sessionId, traceId, momentId, summary, startTime, endTime, momentKinds
              FROM enriched_sessions
              WHERE ${behaviourSessionFilterSql}
              ORDER BY endTime DESC
              LIMIT {pageSize:UInt32}
              OFFSET {offset:UInt32}`,
      query_params: {
        organizationId,
        projectId: data.projectId,
        clusterIds,
        filter,
        pageSize: limit + 1,
        offset,
        ...timeQueryParams,
      },
      format: "JSONEachRow",
    })
    const rows = (await result.json()) as Array<{
      readonly sessionId: string
      readonly traceId: string
      readonly momentId: string
      readonly summary: string
      readonly startTime: string
      readonly endTime: string
      readonly momentKinds: readonly string[]
    }>
    const histogramInterval =
      timeRange.from && (!timeRange.to || timeRange.to.getTime() - timeRange.from.getTime() <= 2 * 24 * 60 * 60_000)
        ? "1 HOUR"
        : "1 DAY"
    const histogramResult = await getClickhouseClient().query({
      query: `${behaviourClusterSessionsCte(timeFromClause, timeToClause)}
              SELECT
                toStartOfInterval(endTime, INTERVAL ${histogramInterval}) AS startTime,
                count() AS count
              FROM enriched_sessions
              WHERE ${behaviourSessionFilterSql}
              GROUP BY startTime
              ORDER BY startTime ASC`,
      query_params: { organizationId, projectId: data.projectId, clusterIds, filter, ...timeQueryParams },
      format: "JSONEachRow",
    })
    const histogram = (await histogramResult.json()) as Array<{
      readonly startTime: string
      readonly count: number
    }>
    const sessions = rows
      .map(
        (row): BehaviourSessionRecord => ({
          sessionId: row.sessionId,
          traceId: row.traceId,
          momentId: row.momentId,
          summary: row.summary,
          startTime: new Date(row.startTime).toISOString(),
          endTime: new Date(row.endTime).toISOString(),
          momentKinds: row.momentKinds,
        }),
      )
      .filter((session) => behaviourSessionFilterMatches(session, filter))
    const pagedSessions = sessions.slice(0, limit)
    return {
      sessions: pagedSessions,
      hasMore: sessions.length > limit,
      nextOffset: sessions.length > limit ? offset + limit : null,
      histogram: histogram.map((bucket) => ({
        startTime: new Date(bucket.startTime).toISOString(),
        count: Number(bucket.count),
      })),
    }
  })

export const getClusterProfile = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), clusterId: z.string(), timeRange: behaviourTimeRangeSchema }))
  .handler(async ({ data }): Promise<ClusterSessionIntelligenceRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const timeRange = parseBehaviourTimeRange(data.timeRange)

    return Effect.runPromise(
      getClusterSessionIntelligenceUseCase({
        organizationId: orgId,
        projectId,
        clusterId: TaxonomyClusterId(data.clusterId),
        sourceWindowStart: timeRange.from ?? new Date(0),
        sourceWindowEnd: timeRange.to ?? new Date(),
      }).pipe(
        Effect.map((result) => ({
          rates: result.rates,
          topMoments: result.topMoments,
          representativeExamples: result.representativeExamples.map((example) =>
            Object.fromEntries(Object.entries(example).map(([key, value]) => [key, String(value)])),
          ),
        })),
        withPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId),
        withClickHouse(clickHouseTaxonomyIntelligenceLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })
