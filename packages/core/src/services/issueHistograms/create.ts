import { format } from 'date-fns'
import { type Issue } from '../../schema/models/types/Issue'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { Commit } from '../../schema/models/types/Commit'
import { Project } from '../../schema/models/types/Project'

export async function createHistogram(
  {
    project,
    commit,
    issue,
    date,
    documentUuid,
    initialCount = 1,
  }: {
    project: Project
    commit: Commit
    issue: Issue
    date: Date
    documentUuid: string
    initialCount?: number
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .insert(issueHistograms)
      .values({
        workspaceId: issue.workspaceId,
        projectId: project.id,
        commitId: commit.id,
        issueId: issue.id,
        documentUuid,
        date: format(date, 'yyyy-MM-dd'),
        count: initialCount,
      })
      .returning()

    return Result.ok(result[0]!)
  })
}
