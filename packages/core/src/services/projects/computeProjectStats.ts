import { and, count, desc, eq, inArray, isNull, sql, sum } from 'drizzle-orm'
import {
  EvaluationType,
  PROJECT_STATS_CACHE_KEY,
  ProjectStats,
  STATS_CACHE_TTL,
  STATS_CACHING_THRESHOLD,
} from '../../browser'
import { cache } from '../../cache'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  commits,
  documentLogs,
  documentVersions,
  evaluationResultsV2,
  evaluationVersions,
  providerLogs,
} from '../../schema'

/**
 * Computes project statistics with caching support
 * @param projectId The project to compute stats for
 * @param workspaceId The workspace to compute stats for
 * @param forceRefresh Whether to force a refresh of the cache
 * @returns Project stats
 */
export async function computeProjectStats(
  {
    workspaceId,
    projectId,
    forceRefresh = false,
  }: {
    workspaceId: number
    projectId: number
    forceRefresh?: boolean
  },
  db = database,
) {
  const redis = await cache()
  const cacheKey = PROJECT_STATS_CACHE_KEY(workspaceId, projectId)

  // Try to get from cache first if not forcing refresh
  if (!forceRefresh) {
    try {
      const cachedStats = await redis.get(cacheKey)
      if (cachedStats) {
        return Result.ok(JSON.parse(cachedStats) as ProjectStats)
      }
    } catch (error) {
      // Continue with computation if cache read fails
    }
  }

  const commitIds = await db
    .select({ commitId: commits.id })
    .from(commits)
    .where(eq(commits.projectId, projectId))
    .then((result) => result.map((r) => r.commitId))

  const activeCommitIds = await db
    .select({ commitId: commits.id })
    .from(commits)
    .where(and(eq(commits.projectId, projectId), isNull(commits.deletedAt)))
    .then((result) => result.map((r) => r.commitId))

  // Get total runs (document logs count)
  const totalRuns = await db
    .select({ count: count() })
    .from(documentLogs)
    .where(inArray(documentLogs.commitId, commitIds))
    .then((result) => result[0]?.count ?? 0)

  // Get total tokens and per-model stats from all provider logs
  const modelStats = await db
    .select({
      model: providerLogs.model,
      totalTokens: sum(providerLogs.tokens).mapWith(Number),
      totalCost: sum(providerLogs.costInMillicents).mapWith(Number),
      runs: count(),
    })
    .from(providerLogs)
    .innerJoin(
      documentLogs,
      eq(documentLogs.uuid, providerLogs.documentLogUuid),
    )
    .where(inArray(documentLogs.commitId, commitIds))
    .groupBy(providerLogs.model)

  // Calculate total tokens
  const totalTokens = modelStats.reduce(
    (acc, stat) => acc + (stat.totalTokens ?? 0),
    0,
  )

  // Build runs per model map
  const runsPerModel = modelStats.reduce<Record<string, number>>(
    (acc, stat) => ({
      ...acc,
      [stat.model ?? 'unknown']: stat.runs,
    }),
    {},
  )

  // Build cost per model map
  const costPerModel = modelStats.reduce<Record<string, number>>(
    (acc, stat) => ({
      ...acc,
      [stat.model ?? 'unknown']: stat.totalCost ?? 0,
    }),
    {},
  )

  // Count total unique documents
  const totalDocuments = await db
    .select({ count: count() })
    .from(
      db
        .selectDistinct({ documentUuid: documentVersions.documentUuid })
        .from(documentVersions)
        .where(inArray(documentVersions.commitId, activeCommitIds))
        .as('unique_docs'),
    )
    .then((result) => result[0]?.count ?? 0)

  // Rolling count of document logs created per day in the last 30 days
  const rollingDocumentLogs = await db
    .select({
      date: sql<string>`date_trunc('day', ${documentLogs.createdAt})::date`.as(
        'date',
      ),
      count: count().as('count'),
    })
    .from(documentLogs)
    .where(
      and(
        inArray(documentLogs.commitId, activeCommitIds),
        sql`${documentLogs.createdAt} >= NOW() - INTERVAL '30 days'`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${documentLogs.createdAt})::date`)
    .orderBy(sql`date_trunc('day', ${documentLogs.createdAt})::date`)
    .then((result) =>
      result.map((row) => ({
        date: row.date,
        count: Number(row.count),
      })),
    )

  // Count total evaluations
  const totalEvaluations = await db
    .select({ count: count() })
    .from(
      db
        .selectDistinct({ evaluationUuid: evaluationVersions.evaluationUuid })
        .from(evaluationVersions)
        .where(inArray(evaluationVersions.commitId, activeCommitIds))
        .as('unique_evals'),
    )
    .then((result) => result[0]?.count ?? 0)

  // Count total evaluation results
  const totalEvaluationResults = await db
    .select({ count: count() })
    .from(evaluationResultsV2)
    .where(inArray(evaluationResultsV2.commitId, activeCommitIds))
    .then((result) => result[0]?.count ?? 0)

  // Get latest evaluation versions for v2
  const latestEvaluationsVersions = db.$with('latest_evaluations_versions').as(
    db
      .selectDistinctOn([evaluationVersions.evaluationUuid], {
        uuid: evaluationVersions.evaluationUuid,
        type: evaluationVersions.type,
        name: evaluationVersions.name,
      })
      .from(evaluationVersions)
      .innerJoin(commits, eq(commits.id, evaluationVersions.commitId)) // NOTE: can't remove this join because of the sorting
      .where(and(eq(commits.projectId, projectId), isNull(commits.deletedAt)))
      .orderBy(desc(evaluationVersions.evaluationUuid), desc(commits.mergedAt)),
  )

  // Calculate cost per evaluation from evaluation provider logs - v2
  const costPerEvaluation = await db
    .with(latestEvaluationsVersions)
    .select({
      evaluation: latestEvaluationsVersions.name,
      totalCost:
        sql`sum((${evaluationResultsV2.metadata}->>'cost')::bigint)`.mapWith(
          Number,
        ),
    })
    .from(evaluationResultsV2)
    .innerJoin(
      latestEvaluationsVersions,
      eq(latestEvaluationsVersions.uuid, evaluationResultsV2.evaluationUuid),
    )
    .where(
      and(
        inArray(evaluationResultsV2.commitId, activeCommitIds),
        eq(latestEvaluationsVersions.type, EvaluationType.Llm),
      ),
    )
    .groupBy(latestEvaluationsVersions.name)
    .then((result) =>
      result.reduce<Record<string, number>>(
        (acc, stat) => ({
          ...acc,
          [stat.evaluation]: stat.totalCost ?? 0,
        }),
        {},
      ),
    )

  const stats: ProjectStats = {
    totalTokens,
    totalRuns,
    totalDocuments,
    runsPerModel,
    costPerModel,
    rollingDocumentLogs,
    totalEvaluations,
    totalEvaluationResults,
    costPerEvaluation,
  }

  // Only cache the results if the project has more than STATS_CACHING_THRESHOLD logs
  if (totalRuns >= STATS_CACHING_THRESHOLD) {
    try {
      await redis.set(cacheKey, JSON.stringify(stats), 'EX', STATS_CACHE_TTL)
    } catch (error) {
      // Continue even if caching fails
    }
  }

  return Result.ok(stats)
}
