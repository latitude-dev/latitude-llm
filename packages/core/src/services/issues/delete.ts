import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { type Workspace } from '../../schema/models/types/Workspace'
import { getIssuesCollection } from '../../weaviate'

export async function deleteIssue(
  {
    issue: { id, uuid },
    workspace,
  }: {
    issue: Issue
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  // Note: optimistically deleting from vector db
  const deleting = await deleteVector({ uuid, workspace })
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
            eq(evaluationVersions.workspaceId, workspace.id),
            eq(evaluationVersions.issueId, id),
          ),
        )

      await tx
        .update(evaluationResultsV2)
        .set({ issueId: null })
        .where(
          and(
            eq(evaluationResultsV2.workspaceId, workspace.id),
            eq(evaluationResultsV2.issueId, id),
          ),
        )

      await tx
        .delete(issueHistograms)
        .where(
          and(
            eq(issueHistograms.workspaceId, workspace.id),
            eq(issueHistograms.issueId, id),
          ),
        )

      const issue = (await tx
        .delete(issues)
        .where(and(eq(issues.workspaceId, workspace.id), eq(issues.id, id)))
        .returning()
        .then((r) => r[0]!)) as Issue

      return Result.ok({ issue })
    },
    async ({ issue }) => {
      await publisher.publishLater({
        type: 'issueDeleted',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
        },
      })
    },
  )
}

async function deleteVector({
  uuid,
  workspace,
}: {
  uuid: string
  workspace: Workspace
}) {
  try {
    const issues = await getIssuesCollection(workspace)

    const exists = await issues.data.exists(uuid)
    if (!exists) {
      // Note: if this happens the vector db is out of sync
      // with the database! Fail silently in this case

      return Result.nil()
    }

    await issues.data.deleteById(uuid)

    const count = await issues.length()
    if (count === 0) {
      await issues.tenants.remove(String(workspace.id))
    }

    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
