import { type Issue } from '../../schema/models/types/Issue'
import Transaction from '../../lib/Transaction'
import { Commit } from '../../schema/models/types/Commit'
import { IssueHistogramsRepository } from '../../repositories/issueHistogramsRepository'
import { updateHistogram } from './update'
import { createHistogram } from './create'

export async function upsertHistogram(
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
  const existing = await histogramRepo.findHistogram({
    commit,
    issue,
    date,
  })

  if (existing) {
    return updateHistogram(
      { histogram: existing, count: 1, direction: 'increment' },
      transaction,
    )
  }

  return createHistogram({ commit, issue, date }, transaction)
}
