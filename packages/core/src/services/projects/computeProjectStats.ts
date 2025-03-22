import { and, count, eq, inArray, isNull, sql, sum } from 'drizzle-orm'

import { Project } from '../../browser'
import { database } from '../../client'
import { EvaluationType, ProjectStats } from '../../constants'
import { Result } from '../../lib'
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

export async function computeProjectStats({ project }: { project: Project }) {
  const db = database

  // Get total runs (document logs count)
  const totalRuns = await db
    .select({ count: count() })
    .from(documentLogs)
    .innerJoin(commits, eq(documentLogs.commitId, commits.id))
    .where(eq(commits.projectId, project.id))
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
      date: sql<string>`DATE(${documentLogs.createdAt})`.as('date'),
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
    .groupBy(sql`DATE(${documentLogs.createdAt})`)
    .orderBy(sql`DATE(${documentLogs.createdAt})`)
    .then((result) =>
      result.map((row) => ({
        date: row.date,
        count: Number(row.count),
      })),
    )

  const documentUuids = await db
    .select({ documentUuid: documentVersions.documentUuid })
    .from(documentVersions)
    .innerJoin(commits, eq(documentVersions.commitId, commits.id))
    .where(and(eq(commits.projectId, project.id), isNull(commits.deletedAt)))
    .then((result) => result.map((row) => row.documentUuid))

  // Count total evaluations
  const totalEvaluationsV1 = await db
    .select({ count: count() })
    .from(connectedEvaluations)
    .innerJoin(
      evaluations,
      eq(connectedEvaluations.evaluationId, evaluations.id),
    )
    .where(inArray(connectedEvaluations.documentUuid, documentUuids))
    .then((result) => result[0]?.count ?? 0)

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

  // Count total evaluation results
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

  const totalEvaluationResultsV2 = await db
    .select({ count: count() })
    .from(evaluationResultsV2)
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(and(eq(commits.projectId, project.id), isNull(commits.deletedAt)))
    .then((result) => result[0]?.count ?? 0)

  const totalEvaluationResults =
    totalEvaluationResultsV1 + totalEvaluationResultsV2

  // Calculate cost per evaluation from evaluation provider logs
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

  const costPerEvaluationV2 = await db
    .select({
      evaluation: evaluationVersions.name,
      totalCost: sum(providerLogs.costInMillicents).mapWith(Number),
    })
    .from(evaluationResultsV2)
    .innerJoin(
      evaluationVersions,
      eq(evaluationVersions.evaluationUuid, evaluationResultsV2.evaluationUuid),
    )
    .innerJoin(
      providerLogs,
      sql`${providerLogs.id} = (${evaluationResultsV2.metadata}->>'evaluationLogId')::bigint`,
    )
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(
      and(
        eq(commits.projectId, project.id),
        isNull(commits.deletedAt),
        eq(evaluationVersions.type, EvaluationType.Llm),
      ),
    )
    .groupBy(evaluationVersions.name)
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

  return Result.ok(stats)
}
