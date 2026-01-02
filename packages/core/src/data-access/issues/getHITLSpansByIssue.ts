import { Result } from '../../lib/Result'
import {
  EvaluationResultsV2Repository,
  SpansRepository,
} from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { Span } from '@latitude-data/constants'
import { database } from '../../client'

/**
 * Fetches spans associated with an issue through HITL (Human-in-the-Loop) evaluation results,
 * filtered by specific commits.
 *
 * Relationship: Issue → issueEvaluationResults → evaluationResultsV2 → evaluationVersions (type='human') → commits → spans
 *
 * Why paginate by evaluation results when returning spans?
 * - There's a 1:1 relationship between evaluation results and spans
 *   (each evaluationResultV2 has exactly one evaluatedSpanId + evaluatedTraceId)
 * - Paginating 25 evaluation results = getting exactly 25 spans
 * - The UI displays spans ordered by when they were evaluated (evaluationResultsV2.createdAt)
 * - This approach lets us paginate on smaller tables (evaluation results) before
 *   touching the huge spans table, then fetch only the specific spans we need
 *
 * This ensures the query planner can apply LIMIT before scanning the spans table.
 */
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
    afterDate?: Date
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
    spans: orderedSpans,
    hasNextPage,
  })
}
