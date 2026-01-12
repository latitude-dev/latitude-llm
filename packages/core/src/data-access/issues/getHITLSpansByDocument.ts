import { Span, SpanType } from '@latitude-data/constants'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  EvaluationResultsV2Repository,
  SpansRepository,
} from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'

/**
 * Fetches spans associated with a document UUID that are NOT linked to any issues,
 * filtered by specific commits and paginated.
 * Only includes spans that have HITL (Human-in-the-Loop) evaluation results.
 *
 * Relationship: evaluationResultsV2 → evaluationVersions (type='human', documentUuid) → commits
 * Excludes: evaluationResultsV2 that have issueEvaluationResults
 *
 * Why paginate by evaluation results when returning spans?
 * - There can be multiple evaluation results for the same span (after unique constraints were removed)
 * - Paginating 25 evaluation results returns up to 25 unique spans (after deduplication)
 * - The UI displays spans ordered by when they were evaluated (evaluationResultsV2.createdAt)
 * - This approach lets us paginate on smaller tables (evaluation results) before
 *   touching the huge spans table, then fetch only the specific spans we need
 *
 * This ensures the query planner can apply LIMIT before scanning the spans table.
 */
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
    spans: orderedSpans as Span<SpanType.Prompt>[],
    evaluationResults: paginatedResults,
    hasNextPage,
  })
}
