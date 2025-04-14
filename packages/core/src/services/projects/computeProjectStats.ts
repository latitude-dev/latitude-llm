import { and, count, desc, eq, inArray, isNull, sql, sum } from 'drizzle-orm'

import { Project } from '../../browser'
import { database } from '../../client'
import { EvaluationType, ProjectStats } from '../../constants'
import { Result } from '../../lib/Result'
import {
  commits,
  connectedEvaluations,
  documentLogs,
  documentVersions,
  evaluationResults,
  evaluationResultsV2,
  evaluations,
  evaluationVersions,
  providerLogs,
} from '../../schema'
import { computeTotalRuns } from './computeTotalRuns'
import { cache } from '../../cache'

// Cache key prefix for project stats
const PROJECT_STATS_CACHE_PREFIX = 'project_stats:'
// Cache TTL in seconds (24 hours)
const CACHE_TTL = 24 * 60 * 60
// Minimum number of logs required to cache project stats
export const MIN_LOGS_FOR_CACHING = 5000

/**
 * Computes project statistics with caching support
 * @param project The project to compute stats for
 * @param forceRefresh Whether to force a refresh of the cache
 * @returns Project stats
 */
export async function computeProjectStats({
  project,
  forceRefresh = false,
}: {
  project: Project
  forceRefresh?: boolean
}) {
  const db = database
  const redis = await cache()
  const cacheKey = `${PROJECT_STATS_CACHE_PREFIX}${project.id}`

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

  // Get total runs (document logs count)
  const totalRunsResult = await computeTotalRuns(project, db)
  if (totalRunsResult.error) return totalRunsResult

  const totalRuns = totalRunsResult.unwrap()

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
    .innerJoin(commits, eq(documentLogs.commitId, commits.id))
    .where(and(eq(commits.projectId, project.id)))
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
        .innerJoin(commits, eq(documentVersions.commitId, commits.id))
        .where(
          and(eq(commits.projectId, project.id), isNull(commits.deletedAt)),
        )
        .as('unique_docs'),
    )
    .then((result) => result[0]?.count ?? 0)

  // Rolling count of document logs created per day in the last 30 days
  const rollingDocumentLogs = await db
    .select({
      date: sql<string>`date_trunc('day', ${documentLogs.createdAt})::date`.as(
        'date',
      ),
      count: count(documentLogs.id).as('count'),
    })
    .from(documentLogs)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
    )
    .where(
      and(
        eq(commits.projectId, project.id),
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

  // Get document UUIDs for evaluation queries
  const documentUuids = await db
    .select({ documentUuid: documentVersions.documentUuid })
    .from(documentVersions)
    .innerJoin(commits, eq(documentVersions.commitId, commits.id))
    .where(and(eq(commits.projectId, project.id), isNull(commits.deletedAt)))
    .then((result) => result.map((row) => row.documentUuid))

  // Count total evaluations - v1
  const totalEvaluationsV1 = await db
    .select({ count: count() })
    .from(connectedEvaluations)
    .innerJoin(
      evaluations,
      eq(connectedEvaluations.evaluationId, evaluations.id),
    )
    .where(inArray(connectedEvaluations.documentUuid, documentUuids))
    .then((result) => result[0]?.count ?? 0)

  // Count total evaluations - v2
  const totalEvaluationsV2 = await db
    .select({ count: count() })
    .from(
      db
        .selectDistinct({ evaluationUuid: evaluationVersions.evaluationUuid })
        .from(evaluationVersions)
        .innerJoin(commits, eq(commits.id, evaluationVersions.commitId))
        .where(
          and(eq(commits.projectId, project.id), isNull(commits.deletedAt)),
        )
        .as('unique_evals'),
    )
    .then((result) => result[0]?.count ?? 0)

  const totalEvaluations = totalEvaluationsV1 + totalEvaluationsV2

  // Count total evaluation results - v1
  const totalEvaluationResultsV1 = await db
    .select({ count: count() })
    .from(evaluationResults)
    .innerJoin(evaluations, eq(evaluationResults.evaluationId, evaluations.id))
    .innerJoin(
      connectedEvaluations,
      eq(evaluations.id, connectedEvaluations.evaluationId),
    )
    .where(inArray(connectedEvaluations.documentUuid, documentUuids))
    .then((result) => result[0]?.count ?? 0)

  // Count total evaluation results - v2
  const totalEvaluationResultsV2 = await db
    .select({ count: count() })
    .from(evaluationResultsV2)
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(and(eq(commits.projectId, project.id), isNull(commits.deletedAt)))
    .then((result) => result[0]?.count ?? 0)

  const totalEvaluationResults =
    totalEvaluationResultsV1 + totalEvaluationResultsV2

  // Calculate cost per evaluation from evaluation provider logs - v1
  const costPerEvaluationV1 = await db
    .select({
      evaluation: evaluations.name,
      totalCost: sum(providerLogs.costInMillicents).mapWith(Number),
    })
    .from(evaluationResults)
    .innerJoin(
      providerLogs,
      eq(evaluationResults.evaluationProviderLogId, providerLogs.id),
    )
    .innerJoin(evaluations, eq(evaluationResults.evaluationId, evaluations.id))
    .innerJoin(
      connectedEvaluations,
      eq(evaluations.id, connectedEvaluations.evaluationId),
    )
    .where(inArray(connectedEvaluations.documentUuid, documentUuids))
    .groupBy(evaluations.name)
    .then((result) =>
      result.reduce<Record<string, number>>(
        (acc, stat) => ({
          ...acc,
          [stat.evaluation]: stat.totalCost ?? 0,
        }),
        {},
      ),
    )

  // Get latest evaluation versions for v2
  const latestEvaluationsVersions = db.$with('latest_evaluations_versions').as(
    db
      .selectDistinctOn([evaluationVersions.evaluationUuid], {
        uuid: evaluationVersions.evaluationUuid,
        type: evaluationVersions.type,
        name: evaluationVersions.name,
      })
      .from(evaluationVersions)
      .innerJoin(commits, eq(commits.id, evaluationVersions.commitId))
      .where(and(eq(commits.projectId, project.id), isNull(commits.deletedAt)))
      .orderBy(desc(evaluationVersions.evaluationUuid), desc(commits.mergedAt)),
  )

  // Calculate cost per evaluation from evaluation provider logs - v2
  const costPerEvaluationV2 = await db
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
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(
      and(
        eq(commits.projectId, project.id),
        isNull(commits.deletedAt),
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

  const costPerEvaluation = {
    ...costPerEvaluationV1,
    ...costPerEvaluationV2,
  }

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

  // Only cache the results if the project has more than MIN_LOGS_FOR_CACHING logs
  if (totalRuns >= MIN_LOGS_FOR_CACHING) {
    try {
      await redis.set(cacheKey, JSON.stringify(stats), 'EX', CACHE_TTL)
    } catch (error) {
      // Continue even if caching fails
    }
  }

  return Result.ok(stats)
}
