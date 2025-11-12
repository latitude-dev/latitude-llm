import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { getIssuesCollection } from '../../weaviate'
import { env } from '@latitude-data/env'

export async function deleteIssue(
  {
    issue,
  }: {
    issue: Issue
  },
  transaction = new Transaction(),
) {
  // Note: optimistically deleting from vector db
  const deleting = await deleteVector({
    uuid: issue.uuid,
    workspaceId: issue.workspaceId,
    projectId: issue.projectId,
    documentUuid: issue.documentUuid,
  })
  if (deleting.error) {
    return Result.error(deleting.error)
  }

  return await transaction.call(
    async (tx) => {
      await tx
        .update(evaluationVersions)
        .set({ issueId: null })
        .where(
          and(
            eq(evaluationVersions.workspaceId, issue.workspaceId),
            eq(evaluationVersions.issueId, issue.id),
          ),
        )

      await tx
        .update(evaluationResultsV2)
        .set({ issueId: null })
        .where(
          and(
            eq(evaluationResultsV2.workspaceId, issue.workspaceId),
            eq(evaluationResultsV2.issueId, issue.id),
          ),
        )

      await tx
        .delete(issueHistograms)
        .where(
          and(
            eq(issueHistograms.workspaceId, issue.workspaceId),
            eq(issueHistograms.issueId, issue.id),
          ),
        )

      const deletedIssue = (await tx
        .delete(issues)
        .where(
          and(
            eq(issues.workspaceId, issue.workspaceId),
            eq(issues.uuid, issue.uuid),
          ),
        )
        .returning()
        .then((r) => r[0]!)) as Issue
      return Result.ok({ issue: deletedIssue })
    },
    async ({ issue: deletedIssue }) => {
      await publisher.publishLater({
        type: 'issueDeleted',
        data: {
          workspaceId: deletedIssue.workspaceId,
          issueId: deletedIssue.id,
        },
      })
    },
  )
}

async function deleteVector({
  uuid,
  workspaceId,
  projectId,
  documentUuid,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  uuid: string
}) {
  if (!env.WEAVIATE_API_KEY) return Result.nil()

  try {
    const issues = await getIssuesCollection({
      workspaceId,
      projectId,
      documentUuid,
    })

    const exists = await issues.data.exists(uuid)
    if (!exists) {
      // Note: if this happens the vector db is out of sync
      // with the database! Fail silently in this case

      return Result.nil()
    }

    await issues.data.deleteById(uuid)

    const count = await issues.length()
    if (count === 0) {
      await issues.tenants.remove(String(workspaceId))
    }

    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
