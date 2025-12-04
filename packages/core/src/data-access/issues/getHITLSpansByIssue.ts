import { and, eq, sql } from 'drizzle-orm'
import { Result } from '../../lib/Result'
import { EvaluationResultsV2Repository } from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { spans } from '../../schema/models/spans'
import { Span, SpanType } from '@latitude-data/constants'
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
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    page: number
    pageSize: number
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

  const fetchedSpans = await db
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
