import { MainSpanType, Span } from '@latitude-data/constants'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  EvaluationResultsV2Repository,
  SpansRepository,
} from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'

export async function getHITLSpansByDocument(
  {
    workspace,
    commit,
    documentUuid,
    excludeIssueId,
    page,
    pageSize,
    afterDate,
    orderDirection = 'asc',
  }: {
    workspace: Workspace
    commit: Commit
    documentUuid: string
    excludeIssueId: number
    page: number
    pageSize: number
    orderDirection?: 'asc' | 'desc'
    afterDate?: string
  },
  db = database,
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id, db)
  const { results: paginatedResults, hasNextPage } =
    await resultsRepository.fetchPaginatedHITLResultsByDocument({
      workspace,
      commit,
      documentUuid,
      excludeIssueId,
      page,
      pageSize,
      afterDate,
      orderDirection,
    })

  if (paginatedResults.length === 0) {
    return Result.ok({
      spans: [] as Span[],
      evaluationResults: paginatedResults,
      hasNextPage: false,
    })
  }

  const spansRepository = new SpansRepository(workspace.id, db)
  const orderedSpans =
    await spansRepository.findByEvaluationResults(paginatedResults)

  return Result.ok({
    spans: orderedSpans as Span<MainSpanType>[],
    evaluationResults: paginatedResults,
    hasNextPage,
  })
}
