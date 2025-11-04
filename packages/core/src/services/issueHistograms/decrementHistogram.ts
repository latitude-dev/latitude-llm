import { type Issue } from '../../schema/models/types/Issue'
import Transaction from '../../lib/Transaction'
import { Commit } from '../../schema/models/types/Commit'
import { IssueHistogramsRepository } from '../../repositories/issueHistogramsRepository'
import { updateHistogram } from './update'
import { Result } from '../../lib/Result'

export async function decrementHistogram(
  {
    commit,
    issue,
    date,
  }: {
    commit: Commit
    issue: Issue
    date: Date
  },
  transaction = new Transaction(),
) {
  const histogramRepo = new IssueHistogramsRepository(issue.workspaceId)
  const histogram = await histogramRepo.findHistogram({
    commit,
    issue,
    date,
  })

  if (!histogram) return Result.ok(null)

  return updateHistogram(
    { histogram, count: 1, direction: 'decrement' },
    transaction,
  )
}
