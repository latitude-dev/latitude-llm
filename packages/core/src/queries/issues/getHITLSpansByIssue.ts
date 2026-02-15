import { MainSpanType, Span } from '@latitude-data/constants'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  EvaluationResultsV2Repository,
  SpansRepository,
} from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'

export async function getHITLSpansByIssue(
  {
    workspace,
    commit,
    issue,
    page,
    pageSize,
    afterDate,
    orderDirection = 'asc',
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    page: number
    pageSize: number
    afterDate?: string
    orderDirection?: 'asc' | 'desc'
  },
  db = database,
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id, db)
  const { results: paginatedResults, hasNextPage } =
    await resultsRepository.fetchPaginatedHITLResultsByIssue({
      workspace,
      commit,
      issue,
      page,
      pageSize,
      afterDate,
      orderDirection,
    })

  if (paginatedResults.length === 0) {
    return Result.ok({
      spans: [] as Span[],
      hasNextPage: false,
    })
  }

  const spansRepository = new SpansRepository(workspace.id, db)
  const orderedSpans =
    await spansRepository.findByEvaluationResults(paginatedResults)

  return Result.ok({
    spans: orderedSpans as Span<MainSpanType>[],
    hasNextPage,
  })
}
