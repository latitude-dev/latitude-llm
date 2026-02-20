import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
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
import { CommitsRepository } from '../../repositories/commitsRepository'
import { commits } from '../../schema/models/commits'
import {
  TABLE_NAME as CH_EVALUATION_RESULTS_TABLE,
  type EvaluationResultV2Row,
} from '../../schema/models/clickhouse/evaluationResults'
import { TABLE_NAME as CH_SPANS_TABLE } from '../../schema/models/clickhouse/spans'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { experiments } from '../../schema/models/experiments'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { optimizations } from '../../schema/models/optimizations'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'
import { isClickHouseEvaluationResultsReadEnabled } from '../../services/workspaceFeatures/isClickHouseEvaluationResultsReadEnabled'
import { isClickHouseSpansReadEnabled } from '../../services/workspaceFeatures/isClickHouseSpansReadEnabled'

type OptimizationSpanRef = Pick<Span<MainSpanType>, 'id' | 'traceId'>

/**
 * Fetches optimization-ready span references for issue sampling.
 */
export async function getSpansByIssueForOptimization(
  {
    workspace,
    commit,
    issue,
    spanTypes = Array.from(MAIN_SPAN_TYPES) as MainSpanType[],
    cursor,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    spanTypes?: MainSpanType[]
    cursor: Cursor<string, string> | null
    limit?: number
  },
  db = database,
) {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)

  if (commitIds.length === 0) {
    return Result.ok({
      spans: [] as OptimizationSpanRef[],
      next: null,
    })
  }

  const [useClickHouseEvals, useClickHouseSpans, optimizationExperimentUuids] =
    await Promise.all([
      isClickHouseEvaluationResultsReadEnabled(workspace.id, db),
      isClickHouseSpansReadEnabled(workspace.id, db),
      db
        .select({ uuid: experiments.uuid })
        .from(experiments)
        .innerJoin(
          optimizations,
          or(
            eq(experiments.id, optimizations.baselineExperimentId),
            eq(experiments.id, optimizations.optimizedExperimentId),
          ),
        )
        .then((rows) => rows.map((row) => row.uuid)),
    ])

  const spanRefs =
    useClickHouseEvals && useClickHouseSpans
      ? await getSpanRefsFromClickHouse({
          workspaceId: workspace.id,
          issueId: issue.id,
          commitUuids: commitHistory.map((c) => c.uuid),
          cursor,
          limit,
          spanTypes,
          optimizationExperimentUuids,
        })
      : await getSpanRefsFromPostgres({
          workspaceId: workspace.id,
          issueId: issue.id,
          commitIds,
          cursor,
          limit,
          spanTypes,
          optimizationExperimentUuids,
          db,
        })

  const hasMore = spanRefs.length > limit
  const paginated = hasMore ? spanRefs.slice(0, limit) : spanRefs

  const lastItem = paginated.at(-1)
  const next: Cursor<string, string> | null =
    hasMore && lastItem
      ? {
          value: lastItem.traceId,
          id: lastItem.id,
        }
      : null

  return Result.ok({
    spans: paginated,
    next,
  })
}

async function getSpanRefsFromClickHouse({
  workspaceId,
  issueId,
  commitUuids,
  cursor,
  limit,
  spanTypes,
  optimizationExperimentUuids,
}: {
  workspaceId: number
  issueId: number
  commitUuids: string[]
  cursor: Cursor<string, string> | null
  limit: number
  spanTypes: MainSpanType[]
  optimizationExperimentUuids: string[]
}) {
  const cursorCondition = cursor
    ? 'AND (er.evaluated_trace_id, er.evaluated_span_id) < ({cursorTraceId: String}, {cursorSpanId: String})'
    : ''

  const optimizationExperimentCondition = optimizationExperimentUuids.length
    ? 'OR sp.experiment_uuid NOT IN ({optimizationExperimentUuids: Array(UUID)})'
    : ''

  const queryParams: Record<string, unknown> = {
    workspaceId,
    issueId,
    commitUuids,
    spanTypes,
    limit: limit + 1,
    okStatus: SpanStatus.Ok,
    optimizationSource: LogSources.Optimization,
    experimentSource: LogSources.Experiment,
  }

  if (cursor) {
    queryParams.cursorTraceId = cursor.value
    queryParams.cursorSpanId = cursor.id
  }

  if (optimizationExperimentUuids.length) {
    queryParams.optimizationExperimentUuids = optimizationExperimentUuids
  }

  const query = await clickhouseClient().query({
    query: `
      SELECT
        er.evaluated_span_id AS span_id,
        er.evaluated_trace_id AS trace_id
      FROM ${CH_EVALUATION_RESULTS_TABLE} er
      INNER JOIN ${CH_SPANS_TABLE} sp
        ON sp.workspace_id = er.workspace_id
       AND sp.trace_id = er.evaluated_trace_id
       AND sp.span_id = er.evaluated_span_id
      WHERE er.workspace_id = {workspaceId: UInt64}
        AND has(er.issue_ids, {issueId: UInt64})
        AND er.evaluated_span_id IS NOT NULL
        AND er.evaluated_trace_id IS NOT NULL
        AND er.commit_uuid IN ({commitUuids: Array(UUID)})
        AND sp.status = {okStatus: String}
        AND sp.type IN ({spanTypes: Array(String)})
        AND sp.source != {optimizationSource: String}
        AND (
          sp.source != {experimentSource: String}
          OR sp.experiment_uuid IS NULL
          ${optimizationExperimentCondition}
        )
        ${cursorCondition}
      GROUP BY trace_id, span_id
      ORDER BY trace_id DESC, span_id DESC
      LIMIT {limit: UInt64}
    `,
    format: 'JSONEachRow',
    query_params: queryParams,
  })

  return query
    .json<
      Pick<EvaluationResultV2Row, 'evaluated_span_id' | 'evaluated_trace_id'>
    >()
    .then((rows) =>
      rows.map((row) => ({
        id: row.evaluated_span_id!,
        traceId: row.evaluated_trace_id!,
      })),
    )
}

async function getSpanRefsFromPostgres({
  workspaceId,
  issueId,
  commitIds,
  cursor,
  limit,
  spanTypes,
  optimizationExperimentUuids,
  db,
}: {
  workspaceId: number
  issueId: number
  commitIds: number[]
  cursor: Cursor<string, string> | null
  limit: number
  spanTypes: MainSpanType[]
  optimizationExperimentUuids: string[]
  db: typeof database
}) {
  const cursorCondition = cursor
    ? sql`(${evaluationResultsV2.evaluatedTraceId}, ${evaluationResultsV2.evaluatedSpanId}) < (${cursor.value}, ${cursor.id})`
    : undefined

  const experimentSourceFilter = optimizationExperimentUuids.length
    ? or(
        ne(spans.source, LogSources.Experiment),
        isNull(spans.experimentUuid),
        notInArray(spans.experimentUuid, optimizationExperimentUuids),
      )
    : or(ne(spans.source, LogSources.Experiment), isNull(spans.experimentUuid))

  const rows = await db
    .selectDistinct({
      id: evaluationResultsV2.evaluatedSpanId,
      traceId: evaluationResultsV2.evaluatedTraceId,
    })
    .from(issueEvaluationResults)
    .innerJoin(
      evaluationResultsV2,
      eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
    )
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .innerJoin(
      spans,
      and(
        eq(spans.id, evaluationResultsV2.evaluatedSpanId),
        eq(spans.traceId, evaluationResultsV2.evaluatedTraceId),
      ),
    )
    .where(
      and(
        eq(issueEvaluationResults.workspaceId, workspaceId),
        eq(issueEvaluationResults.issueId, issueId),
        isNotNull(evaluationResultsV2.evaluatedSpanId),
        isNotNull(evaluationResultsV2.evaluatedTraceId),
        isNull(commits.deletedAt),
        inArray(evaluationResultsV2.commitId, commitIds),
        eq(spans.workspaceId, workspaceId),
        eq(spans.status, SpanStatus.Ok),
        inArray(spans.type, spanTypes),
        ne(spans.source, LogSources.Optimization),
        experimentSourceFilter,
        cursorCondition,
      ),
    )
    .orderBy(
      desc(evaluationResultsV2.evaluatedTraceId),
      desc(evaluationResultsV2.evaluatedSpanId),
    )
    .limit(limit + 1)

  return rows.map((row) => ({
    id: row.id!,
    traceId: row.traceId!,
  }))
}
