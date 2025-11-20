import { format } from 'date-fns'
import { and, eq, sql } from 'drizzle-orm'
import { EvaluationResultV2 } from '../../../constants'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { issueHistograms } from '../../../schema/models/issueHistograms'
import { Commit } from '../../../schema/models/types/Commit'
import { Issue } from '../../../schema/models/types/Issue'
import { type IssueHistogram } from '../../../schema/models/types/IssueHistogram'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { updateEscalatingIssue } from '../updateEscalating'

export async function decrementIssueHistogram(
  {
    result,
    issue,
    commit,
    workspace,
  }: {
    result: EvaluationResultV2
    issue: Issue
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  const updatedAt = new Date()
  const date = format(result.createdAt, 'yyyy-MM-dd')

  return await transaction.call(
    async (tx) => {
      const histogram = (await tx
        .insert(issueHistograms)
        .values({
          workspaceId: workspace.id,
          projectId: commit.projectId,
          documentUuid: issue.documentUuid,
          issueId: issue.id,
          commitId: commit.id,
          date: date,
          count: 0,
          occurredAt: result.createdAt,
          createdAt: updatedAt,
          updatedAt: updatedAt,
        })
        .onConflictDoUpdate({
          target: [
            issueHistograms.issueId,
            issueHistograms.commitId,
            issueHistograms.date,
          ],
          set: {
            count: sql<number>`GREATEST(${issueHistograms.count} - 1, 0)`,
            occurredAt: sql<Date>`GREATEST(${issueHistograms.occurredAt}, ${result.createdAt})`,
            updatedAt: updatedAt,
          },
        })
        .returning()
        .then((r) => r[0]!)) as IssueHistogram

      if (histogram.count <= 0) {
        await tx
          .delete(issueHistograms)
          .where(
            and(
              eq(issueHistograms.workspaceId, workspace.id),
              eq(issueHistograms.id, histogram.id),
            ),
          )
      }

      await updateEscalatingIssue({ issue }, transaction).then((r) =>
        r.unwrap(),
      )

      return Result.ok({ histogram })
    },
    async ({ histogram }) => {
      await publisher.publishLater({
        type: 'issueDecremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: histogram.id,
        },
      })
    },
  )
}
