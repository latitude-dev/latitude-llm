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
import { clickhouseClient } from '../../client/clickhouse'
import {
  LogSources,
  MAIN_SPAN_TYPES,
  MainSpanType,
  Span,
  SpanStatus,
} from '../../constants'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories'
import { SpansRepository } from '../../repositories/spansRepository'
import { commits } from '../../schema/models/commits'
import { TABLE_NAME as CH_EVALUATION_RESULTS_TABLE } from '../../schema/models/clickhouse/evaluationResults'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { experiments } from '../../schema/models/experiments'
import { optimizations } from '../../schema/models/optimizations'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'
import { isClickHouseEvaluationResultsReadEnabled } from '../../services/workspaceFeatures/isClickHouseEvaluationResultsReadEnabled'
import { isClickHouseSpansReadEnabled } from '../../services/workspaceFeatures/isClickHouseSpansReadEnabled'

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

  const [useClickHouseEvals, useClickHouseSpans] = await Promise.all([
    isClickHouseEvaluationResultsReadEnabled(workspace.id, db),
    isClickHouseSpansReadEnabled(workspace.id, db),
  ])

  if (useClickHouseEvals && useClickHouseSpans) {
    const spansRepository = new SpansRepository(workspace.id, db)
    const commitUuids = commitHistory.map((c) => c.uuid)
    const optimizationExperimentUuids = await db
      .select({ uuid: experiments.uuid })
      .from(experiments)
      .innerJoin(
        optimizations,
        or(
          eq(experiments.id, optimizations.baselineExperimentId),
          eq(experiments.id, optimizations.optimizedExperimentId),
        ),
      )
      .then((rows) => rows.map((r) => r.uuid))

    const allowedTypes = new Set(spanTypes)
    const optimizationExperiments = new Set(optimizationExperimentUuids)
    const rankedRows: Array<{
      span_id: string
      trace_id: string
      latest_evaluated_at: string
      latest_eval_id: number
    }> = []

    let nextCursor = cursor
    const fetchLimit = Math.max(limit * 3, 50)

    while (rankedRows.length < limit + 1) {
      const queryParams: Record<string, unknown> = {
        workspaceId: workspace.id,
        evaluationUuid,
        commitUuids,
        fetchLimit,
      }

      const passedCondition = passed
        ? 'has_passed = 1'
        : '(has_passed = 0 OR has_passed IS NULL)'

      const cursorCondition = nextCursor
        ? 'AND (latest_evaluated_at, latest_eval_id) < ({cursorDate: DateTime64(3)}, {cursorId: UInt64})'
        : ''

      if (nextCursor) {
        queryParams.cursorDate = nextCursor.value.toISOString()
        queryParams.cursorId = nextCursor.id
      }

      const query = await clickhouseClient().query({
        query: `
          SELECT *
          FROM (
            SELECT
              evaluated_span_id as span_id,
              evaluated_trace_id as trace_id,
              max(created_at) as latest_evaluated_at,
              max(id) as latest_eval_id
            FROM ${CH_EVALUATION_RESULTS_TABLE}
            WHERE workspace_id = {workspaceId: UInt64}
              AND evaluation_uuid = {evaluationUuid: UUID}
              AND ${passedCondition}
              AND evaluated_span_id IS NOT NULL
              AND evaluated_trace_id IS NOT NULL
              AND commit_uuid IN ({commitUuids: Array(UUID)})
            GROUP BY evaluated_span_id, evaluated_trace_id
          )
          WHERE 1 = 1
            ${cursorCondition}
          ORDER BY latest_evaluated_at DESC, latest_eval_id DESC
          LIMIT {fetchLimit: UInt64}
        `,
        format: 'JSONEachRow',
        query_params: queryParams,
      })

      const batch = await query.json<{
        span_id: string
        trace_id: string
        latest_evaluated_at: string
        latest_eval_id: number
      }>()

      if (!batch.length) break

      const orderedSpans = await spansRepository.findByEvaluationResults(
        batch.map((row) => ({
          evaluatedSpanId: row.span_id,
          evaluatedTraceId: row.trace_id,
        })),
      )

      const spanMap = new Map(
        orderedSpans.map((span) => [`${span.id}:${span.traceId}`, span]),
      )

      for (const row of batch) {
        const span = spanMap.get(`${row.span_id}:${row.trace_id}`)
        if (!span) continue
        if (span.workspaceId !== workspace.id) continue
        if (span.documentUuid !== document.documentUuid) continue
        if (span.status !== SpanStatus.Ok) continue
        if (!allowedTypes.has(span.type as MainSpanType)) continue
        if (span.source === LogSources.Optimization) continue
        if (
          span.source === LogSources.Experiment &&
          span.experimentUuid &&
          optimizationExperiments.has(span.experimentUuid)
        ) {
          continue
        }

        rankedRows.push(row)
        if (rankedRows.length >= limit + 1) break
      }

      if (batch.length < fetchLimit || rankedRows.length >= limit + 1) {
        break
      }

      const last = batch[batch.length - 1]!
      nextCursor = {
        value: new Date(last.latest_evaluated_at),
        id: last.latest_eval_id,
      }
    }

    const hasMore = rankedRows.length > limit
    const paginatedRows = hasMore ? rankedRows.slice(0, limit) : rankedRows

    const spans = await spansRepository.findByEvaluationResults(
      paginatedRows.map((row) => ({
        evaluatedSpanId: row.span_id,
        evaluatedTraceId: row.trace_id,
      })),
    )

    const lastItem = paginatedRows.at(-1)
    const finalNext: Cursor<Date, number> | null =
      hasMore && lastItem
        ? {
            value: new Date(lastItem.latest_evaluated_at),
            id: lastItem.latest_eval_id,
          }
        : null

    return Result.ok({
      spans: spans as Span<MainSpanType>[],
      next: finalNext,
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
