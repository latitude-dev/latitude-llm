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
import { CommitsRepository } from '../../repositories/commitsRepository'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { experiments } from '../../schema/models/experiments'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { optimizations } from '../../schema/models/optimizations'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'

export async function getSpansByIssue(
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
    paginatedSpans.length > 0
      ? paginatedSpans[paginatedSpans.length - 1]
      : null
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
