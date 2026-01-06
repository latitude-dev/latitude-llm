import { and, eq, inArray } from 'drizzle-orm'
import { Database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { CommitsRepository, IssuesRepository } from '../../repositories'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { issues } from '../../schema/models/issues'
import { Commit } from '../../schema/models/types/Commit'
import { updateEscalatingIssue } from '../../services/issues/updateEscalating'
import { DocumentsDeletedEvent } from '../events'

async function unassignIssueEvaluationResults({
  documentUuids,
  commit,
  db,
}: {
  documentUuids: string[]
  commit: Commit
  db: Database
}) {
  const issueIdsSubquery = db
    .select({ id: issues.id })
    .from(issues)
    .where(inArray(issues.documentUuid, documentUuids))

  const evalResultIdsSubquery = db
    .select({ id: evaluationResultsV2.id })
    .from(evaluationResultsV2)
    .where(eq(evaluationResultsV2.commitId, commit.id))

  await db.delete(issueEvaluationResults).where(
    and(
      inArray(issueEvaluationResults.issueId, issueIdsSubquery),
      inArray(issueEvaluationResults.evaluationResultId, evalResultIdsSubquery),
    ),
  )
}

async function deleteHistogramsAndUpdateEscalation({
  workspaceId,
  documentUuids,
  commit,
  db,
  transaction,
}: {
  workspaceId: number
  documentUuids: string[]
  commit: Commit
  db: Database
  transaction: Transaction
}) {
  const issuesRepo = new IssuesRepository(workspaceId, db)
  const affectedIssues = await db
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        inArray(issues.documentUuid, documentUuids),
      ),
    )

  if (affectedIssues.length === 0) return

  const issueIds = affectedIssues.map((i) => i.id)

  await db.delete(issueHistograms).where(
    and(
      eq(issueHistograms.workspaceId, workspaceId),
      eq(issueHistograms.commitId, commit.id),
      inArray(issueHistograms.issueId, issueIds),
    ),
  )

  for (const { id } of affectedIssues) {
    const issue = await issuesRepo.find(id).then((r) => r.unwrap())
    await updateEscalatingIssue({ issue }, transaction).then((r) => r.unwrap())
  }
}

export async function unassignIssuesOnDocumentsDeleted({
  data: event,
}: {
  data: DocumentsDeletedEvent
}) {
  const { workspaceId, projectId, commitUuid, documentUuids } = event.data

  if (documentUuids.length === 0) return

  const commitsRepo = new CommitsRepository(workspaceId)
  const commitResult = await commitsRepo.getCommitByUuid({
    projectId,
    uuid: commitUuid,
  })
  if (commitResult.error) return

  const commit = commitResult.value
  const transaction = new Transaction()

  await transaction.call(async (tx) => {
    await unassignIssueEvaluationResults({
      documentUuids,
      commit,
      db: tx,
    })

    await deleteHistogramsAndUpdateEscalation({
      workspaceId,
      documentUuids,
      commit,
      db: tx,
      transaction,
    })

    return Result.ok(true)
  })
}
