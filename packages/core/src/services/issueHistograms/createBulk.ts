import { format } from 'date-fns'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type Issue } from '../../schema/models/types/Issue'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueHistograms } from '../../schema/models/issueHistograms'

export type IssueHistogramData = {
  issue: Issue
  commitId: number
  date: Date
  count: number
}

export async function createIssueHistogramsBulk(
  {
    workspace,
    histograms,
  }: {
    workspace: Workspace
    histograms: IssueHistogramData[]
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const values = histograms.map(({ issue, commitId, date, count }) => ({
      workspaceId: workspace.id,
      issueId: issue.id,
      commitId,
      date: format(date, 'yyyy-MM-dd'),
      count,
    }))

    const results = await tx.insert(issueHistograms).values(values).returning()

    return Result.ok(results)
  })
}
