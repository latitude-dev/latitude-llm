import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  max,
  sql,
} from 'drizzle-orm'
import { database } from '../../client'
import { Span, SpanType } from '../../constants'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'

// BONUS(AO/OPT): Instead of filtering all experiments, only filter experiments from optimizations?

/**
 * Fetches spans associated with an issue through evaluation results,
 * filtered by specific commits.
 */
export async function getSpansByIssue(
  {
    workspace,
    commit,
    issue,
    includeExperiments = true,
    cursor,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    includeExperiments?: boolean
    cursor: Cursor<Date, number> | null
    limit?: number
  },
  db = database,
) {
  // Get the commit history starting from the specified commit
  // This includes the commit itself and all its ancestors
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)

  // Early return if no commits found (shouldn't happen, but defensive check)
  if (commitIds.length === 0) {
    return Result.ok({
      spans: [] as Span<SpanType.Prompt>[],
      next: null,
    })
  }

  // CTE to get row number for each deduped eval result for cursor-based pagination
  // First, collect all deduped results ordered by latest eval date
  const rankedEvalResults = db
    .select({
      spanId: evaluationResultsV2.evaluatedSpanId,
      traceId: evaluationResultsV2.evaluatedTraceId,
      latestEvaluatedAt: max(evaluationResultsV2.createdAt).as(
        'latestEvaluatedAt',
      ),
      latestEvalId: max(evaluationResultsV2.id).as('latestEvalId'),
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
    .groupBy(
      evaluationResultsV2.evaluatedSpanId,
      evaluationResultsV2.evaluatedTraceId,
    )
    .orderBy(
      desc(max(evaluationResultsV2.createdAt)),
      desc(max(evaluationResultsV2.id)),
    )
    .as('rankedEvalResults')

  // Apply cursor filter to the ranked results
  const cursorConditions = cursor
    ? sql`(${rankedEvalResults.latestEvaluatedAt}, ${rankedEvalResults.latestEvalId}) < (${cursor.value}, ${cursor.id})`
    : undefined

  // Second query: Join with span data and apply pagination
  const spansColumns = getTableColumns(spans)
  const rows = await db
    .select({
      span: spansColumns,
      latestEvaluatedAt: rankedEvalResults.latestEvaluatedAt,
      latestEvalId: rankedEvalResults.latestEvalId,
    })
    .from(rankedEvalResults)
    .innerJoin(
      spans,
      and(
        eq(spans.id, rankedEvalResults.spanId),
        eq(spans.traceId, rankedEvalResults.traceId),
      ),
    )
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        eq(spans.type, SpanType.Prompt),
        ...(!includeExperiments ? [isNull(spans.experimentUuid)] : []),
        cursorConditions,
      ),
    )
    .orderBy(
      desc(rankedEvalResults.latestEvaluatedAt),
      desc(rankedEvalResults.latestEvalId),
    )
    .limit(limit + 1)

  // Check if there's a next page by fetching one extra row
  const hasMore = rows.length > limit
  const paginatedSpans = hasMore ? rows.slice(0, limit) : rows

  // Generate cursor for next page from the last item
  const lastItem =
    paginatedSpans.length > 0 ? paginatedSpans[paginatedSpans.length - 1] : null
  const next: Cursor<Date, number> | null =
    hasMore && lastItem && lastItem.latestEvaluatedAt && lastItem.latestEvalId
      ? {
          value: lastItem.latestEvaluatedAt,
          id: lastItem.latestEvalId,
        }
      : null

  return Result.ok({
    spans: paginatedSpans.map((row) => row.span as Span<SpanType.Prompt>),
    next,
  })
}
