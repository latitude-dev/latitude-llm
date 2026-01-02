import { Result } from '../../lib/Result'
import { EvaluationResultsV2Repository } from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'

export async function hasUnprocessedSpans(
  {
    workspace,
    commit,
    issue,
    positiveSpanCutoffDate,
    negativeSpanCutoffDate,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    positiveSpanCutoffDate?: Date
    negativeSpanCutoffDate?: Date
  },
  db = database,
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id, db)

  // Check for unprocessed negative spans (spans linked to this issue)
  const { results: negativeResults } =
    await resultsRepository.fetchPaginatedHITLResultsByIssue({
      workspace,
      commit,
      issue,
      page: 1,
      pageSize: 1,
      afterDate: negativeSpanCutoffDate,
    })

  if (negativeResults.length > 0) {
    return Result.ok(true)
  }

  // Check for unprocessed positive spans (spans not linked to this issue)
  const { results: positiveResults } =
    await resultsRepository.fetchPaginatedHITLResultsByDocument({
      workspace,
      commit,
      documentUuid: issue.documentUuid,
      excludeIssueId: issue.id,
      page: 1,
      pageSize: 1,
      afterDate: positiveSpanCutoffDate,
    })

  return Result.ok(positiveResults.length > 0)
}
