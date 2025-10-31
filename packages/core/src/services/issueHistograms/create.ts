import { format } from 'date-fns'
import { type Issue } from '../../schema/models/types/Issue'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { Commit } from '../../schema/models/types/Commit'

export async function createHistogram(
  {
    commit,
    issue,
    date,
    initialCount = 1,
  }: {
    commit: Commit
    issue: Issue
    date: Date
    initialCount?: number
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .insert(issueHistograms)
      .values({
        workspaceId: issue.workspaceId,
        commitId: commit.id,
        issueId: issue.id,
        date: format(date, 'yyyy-MM-dd'),
        count: initialCount,
      })
      .returning()

    return Result.ok(result[0]!)
  })
}
