import { type Issue } from '../../schema/models/types/Issue'
import Transaction from '../../lib/Transaction'
import { Commit } from '../../schema/models/types/Commit'
import { IssueHistogramsRepository } from '../../repositories/issueHistogramsRepository'
import { updateHistogram } from './update'
import { createHistogram } from './create'
import { Project } from '../../schema/models/types/Project'

export async function upsertHistogram(
  {
    project,
    commit,
    issue,
    date,
    documentUuid,
  }: {
    project: Project
    commit: Commit
    issue: Issue
    date: Date
    documentUuid: string
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

  return createHistogram(
    { project, commit, issue, date, documentUuid },
    transaction,
  )
}
