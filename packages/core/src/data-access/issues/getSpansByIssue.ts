import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { spans } from '../../schema/models/spans'
import { Span, SpanType } from '@latitude-data/constants'

async function fetchPaginatedEvaluationResults({
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
}) {
  const commitsRepo = new CommitsRepository(workspace.id, database)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)
  const limit = pageSize + 1
  const offset = calculateOffset(page, pageSize)
  const evalResults = await database
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
export async function getSpansByIssue({
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
}) {
  const { results: paginatedResults, hasNextPage } =
    await fetchPaginatedEvaluationResults({
      workspace,
      commit,
      issue,
      page,
      pageSize,
    })

  if (paginatedResults.length === 0) {
    return Result.ok({
      spans: [] as Span[],
      hasNextPage: false,
    })
  }

  const spanTraceIdPairs = paginatedResults.map(
    (result) => sql`(${result.evaluatedSpanId}, ${result.evaluatedTraceId})`,
  )

  const fetchedSpans = await database
    .select()
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        sql`(${spans.id}, ${spans.traceId}) IN (${sql.join(spanTraceIdPairs, sql`, `)})`,
        eq(spans.type, SpanType.Prompt),
      ),
    )

  const spanMap = new Map<string, Span>()
  for (const span of fetchedSpans) {
    const key = `${span.id}:${span.traceId}`
    spanMap.set(key, span as Span)
  }

  const orderedSpans = paginatedResults
    .map((result) => {
      const key = `${result.evaluatedSpanId}:${result.evaluatedTraceId}`
      return spanMap.get(key)
    })
    .filter((span): span is Span => span !== undefined)

  return Result.ok({
    spans: orderedSpans,
    hasNextPage,
  })
}
