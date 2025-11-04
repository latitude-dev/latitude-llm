import { format } from 'date-fns'
import { sql } from 'drizzle-orm'
import { EvaluationResultV2 } from '../../../constants'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { issueHistograms } from '../../../schema/models/issueHistograms'
import { Commit } from '../../../schema/models/types/Commit'
import { Issue } from '../../../schema/models/types/Issue'
import { type IssueHistogram } from '../../../schema/models/types/IssueHistogram'
import { type Workspace } from '../../../schema/models/types/Workspace'

export async function incrementIssueHistogram(
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
          count: 1,
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
            count: sql<number>`${issueHistograms.count} + 1`,
            updatedAt: updatedAt,
          },
        })
        .returning()
        .then((r) => r[0]!)) as IssueHistogram

      return Result.ok({ histogram })
    },
    async ({ histogram }) => {
      await publisher.publishLater({
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: histogram.id,
        },
      })
    },
  )
}
