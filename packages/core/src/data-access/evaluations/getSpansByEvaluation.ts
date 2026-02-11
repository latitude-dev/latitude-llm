import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { database } from '../../client'
import {
  LogSources,
  MAIN_SPAN_TYPES,
  MainSpanType,
  Span,
  SpanStatus,
} from '../../constants'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { experiments } from '../../schema/models/experiments'
import { optimizations } from '../../schema/models/optimizations'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'

/**
 * Fetches spans that have evaluation results from a specific evaluation,
 * filtered by whether the result passed or failed.
 *
 * Automatically excludes optimization-related spans:
 * - Spans with source 'optimization'
 * - Spans with source 'experiment' where the experiment is linked
 *   to an optimization (via baselineExperimentId or optimizedExperimentId)
 *
 * @param evaluationUuid - The UUID of the evaluation to filter results by.
 * @param passed - When true, returns spans with hasPassed IS TRUE.
 *   When false, returns spans with hasPassed IS NOT TRUE.
 * @param spanTypes - Array of span types to include. Defaults to all main span types.
 */
export async function getSpansByEvaluation(
  {
    workspace,
    commit,
    document,
    evaluationUuid,
    passed,
    spanTypes = Array.from(MAIN_SPAN_TYPES) as MainSpanType[],
    cursor,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
    evaluationUuid: string
    passed: boolean
    spanTypes?: MainSpanType[]
    cursor: Cursor<Date, number> | null
    limit?: number
  },
  db = database,
) {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)

  if (commitIds.length === 0) {
    return Result.ok({
      spans: [] as Span<MainSpanType>[],
      next: null,
    })
  }

  const passedCondition = passed
    ? sql`${evaluationResultsV2.hasPassed} IS TRUE`
    : sql`${evaluationResultsV2.hasPassed} IS NOT TRUE`

  const rankedEvalResults = db
    .select({
      spanId: evaluationResultsV2.evaluatedSpanId,
      traceId: evaluationResultsV2.evaluatedTraceId,
      latestEvaluatedAt: max(evaluationResultsV2.createdAt).as(
        'latestEvaluatedAt',
      ),
      latestEvalId: max(evaluationResultsV2.id).as('latestEvalId'),
    })
    .from(evaluationResultsV2)
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(
      and(
        eq(evaluationResultsV2.workspaceId, workspace.id),
        eq(evaluationResultsV2.evaluationUuid, evaluationUuid),
        isNotNull(evaluationResultsV2.evaluatedSpanId),
        isNotNull(evaluationResultsV2.evaluatedTraceId),
        isNull(commits.deletedAt),
        inArray(evaluationResultsV2.commitId, commitIds),
        passedCondition,
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

  const cursorConditions = cursor
    ? sql`(${rankedEvalResults.latestEvaluatedAt}, ${rankedEvalResults.latestEvalId}) < (${cursor.value}, ${cursor.id})`
    : undefined

  const optimizationExperimentUuids = db
    .select({ uuid: experiments.uuid })
    .from(experiments)
    .innerJoin(
      optimizations,
      or(
        eq(experiments.id, optimizations.baselineExperimentId),
        eq(experiments.id, optimizations.optimizedExperimentId),
      ),
    )

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
        eq(spans.documentUuid, document.documentUuid),
        inArray(spans.type, spanTypes),
        eq(spans.status, SpanStatus.Ok),
        ne(spans.source, LogSources.Optimization),
        or(
          ne(spans.source, LogSources.Experiment),
          isNull(spans.experimentUuid),
          notInArray(spans.experimentUuid, optimizationExperimentUuids),
        ),
        cursorConditions,
      ),
    )
    .orderBy(
      desc(rankedEvalResults.latestEvaluatedAt),
      desc(rankedEvalResults.latestEvalId),
    )
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const paginatedSpans = hasMore ? rows.slice(0, limit) : rows

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
    spans: paginatedSpans.map((row) => row.span as Span<MainSpanType>),
    next,
  })
}
