import { count, gte } from 'drizzle-orm'

import { MAX_FREE_RUNS, Workspace, WorkspaceUsage } from '../../browser'
import { database } from '../../client'
import { PromisedResult, Result } from '../../lib'
import { EvaluationResultsRepository } from '../../repositories'
import { DocumentLogsRepository } from '../../repositories/documentLogsRepository'

export function getLatestRenewalDate(firstRenewalDate: Date, targetDate: Date) {
  if (targetDate.getTime() < firstRenewalDate.getTime()) {
    return firstRenewalDate
  }

  const day = firstRenewalDate.getDate() // The day of the month is always mantained.

  return new Date(
    targetDate.getFullYear(),
    (targetDate.getMonth() - (targetDate.getDate() < day ? 1 : 0)) % 12,
    day,
  )
}

export async function computeWorkspaceUsage(
  workspace: Workspace,
  db = database,
): PromisedResult<WorkspaceUsage> {
  const { scope: documentLogsScope } = new DocumentLogsRepository(
    workspace.id,
    db,
  )
  const { scope: evaluationResultsScope } = new EvaluationResultsRepository(
    workspace.id,
    db,
  )

  const createdAtDate = workspace.createdAt
  const currentDate = new Date(Date.now())

  const latestRenewalDate = getLatestRenewalDate(createdAtDate, currentDate)

  const evaluationResultsCount = await db
    .select({
      count: count(evaluationResultsScope.id),
    })
    .from(evaluationResultsScope)
    .where(gte(evaluationResultsScope.createdAt, latestRenewalDate))
    .then((r) => r[0]?.count ?? 0)

  const documentLogsCount = await db
    .select({
      count: count(documentLogsScope.id),
    })
    .from(documentLogsScope)
    .where(gte(documentLogsScope.createdAt, latestRenewalDate))
    .then((r) => r[0]?.count ?? 0)

  return Result.ok({
    usage: evaluationResultsCount + documentLogsCount,
    max: MAX_FREE_RUNS,
  })
}
