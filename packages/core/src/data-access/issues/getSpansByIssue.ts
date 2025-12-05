import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { calculateOffset } from '../../lib/pagination'
import { Result } from '../../lib/Result'
import { CommitsRepository, SpansRepository } from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { Span } from '@latitude-data/constants'
import { database } from '../../client'

async function fetchPaginatedEvaluationResults(
  {
    workspace,
    commit,
    issue,
    page,
    pageSize,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    page: number
    pageSize: number
  },
  db = database,
) {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)
  const limit = pageSize + 1
  const offset = calculateOffset(page, pageSize)
  const evalResults = await db
    .select({
      id: evaluationResultsV2.id,
      evaluatedSpanId: evaluationResultsV2.evaluatedSpanId,
      evaluatedTraceId: evaluationResultsV2.evaluatedTraceId,
      createdAt: evaluationResultsV2.createdAt,
    })
    .from(issueEvaluationResults)
    .innerJoin(
      evaluationResultsV2,
      eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
    )
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(
      and(
        eq(issueEvaluationResults.workspaceId, workspace.id),
        eq(issueEvaluationResults.issueId, issue.id),
        isNotNull(evaluationResultsV2.evaluatedSpanId),
        isNotNull(evaluationResultsV2.evaluatedTraceId),
        isNull(commits.deletedAt),
        inArray(evaluationResultsV2.commitId, commitIds),
      ),
    )
    .orderBy(desc(evaluationResultsV2.createdAt), desc(evaluationResultsV2.id))
    .limit(limit)
    .offset(offset)

  const hasNextPage = evalResults.length > pageSize
  const results = hasNextPage ? evalResults.slice(0, pageSize) : evalResults
  return { results, hasNextPage }
}

/**
 * Fetches spans associated with an issue through evaluation results,
 * filtered by specific commits.
 *
 * Relationship: Issue → issueEvaluationResults → evaluationResultsV2 → commits → spans
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
export async function getSpansByIssue(
  {
    workspace,
    commit,
    issue,
    page,
    pageSize,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    page: number
    pageSize: number
  },
  db = database,
) {
  const { results: paginatedResults, hasNextPage } =
    await fetchPaginatedEvaluationResults(
      {
        workspace,
        commit,
        issue,
        page,
        pageSize,
      },
      db,
    )

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
