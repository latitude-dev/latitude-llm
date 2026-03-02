import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { database } from '../../client'
import {
  EvaluationType,
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

/**
 * Fetches full spans associated with an issue for optimization sampling.
 */
export async function getSpansByIssueForOptimization(
  {
    workspace,
    commit,
    issue,
    requireFailedAnnotations = false,
    spanTypes = Array.from(MAIN_SPAN_TYPES) as MainSpanType[],
    cursor = null,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    requireFailedAnnotations?: boolean
    spanTypes?: MainSpanType[]
    cursor?: Cursor<Date, string> | null
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
    .then((rows) => rows.map((row) => row.uuid))

  const rows = await getSpansFromPostgres({
    workspaceId: workspace.id,
    issueId: issue.id,
    requireFailedAnnotations,
    commitIds,
    cursor,
    limit,
    spanTypes,
    optimizationExperimentUuids,
    db,
  })

  const hasMore = rows.length > limit
  const paginatedSpans = hasMore ? rows.slice(0, limit) : rows

  const lastItem = paginatedSpans.at(-1)
  const next: Cursor<Date, string> | null =
    hasMore && lastItem
      ? {
          value: lastItem.startedAt,
          id: lastItem.id,
        }
      : null

  return Result.ok({
    spans: paginatedSpans as Span<MainSpanType>[],
    next,
  })
}

async function getSpansFromPostgres({
  workspaceId,
  issueId,
  requireFailedAnnotations,
  commitIds,
  cursor,
  limit,
  spanTypes,
  optimizationExperimentUuids,
  db,
}: {
  workspaceId: number
  issueId: number
  requireFailedAnnotations: boolean
  commitIds: number[]
  cursor: Cursor<Date, string> | null
  limit: number
  spanTypes: MainSpanType[]
  optimizationExperimentUuids: string[]
  db: typeof database
}) {
  const spansColumns = getTableColumns(spans)

  const cursorCondition = cursor
    ? sql`(${spans.startedAt}, ${spans.id}) < (${cursor.value}, ${cursor.id})`
    : undefined

  const experimentSourceFilter = optimizationExperimentUuids.length
    ? or(
        ne(spans.source, LogSources.Experiment),
        isNull(spans.experimentUuid),
        notInArray(spans.experimentUuid, optimizationExperimentUuids),
      )
    : or(ne(spans.source, LogSources.Experiment), isNull(spans.experimentUuid))

  const issueSpans = db
    .selectDistinct({
      spanId: evaluationResultsV2.evaluatedSpanId,
      traceId: evaluationResultsV2.evaluatedTraceId,
    })
    .from(issueEvaluationResults)
    .innerJoin(
      evaluationResultsV2,
      eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
    )
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(
      and(
        eq(issueEvaluationResults.workspaceId, workspaceId),
        eq(issueEvaluationResults.issueId, issueId),
        isNotNull(evaluationResultsV2.evaluatedSpanId),
        isNotNull(evaluationResultsV2.evaluatedTraceId),
        isNull(commits.deletedAt),
        inArray(evaluationResultsV2.commitId, commitIds),
        ...(requireFailedAnnotations
          ? [
              sql`${evaluationResultsV2.hasPassed} IS NOT TRUE`,
              eq(evaluationResultsV2.type, EvaluationType.Human),
            ]
          : []),
      ),
    )
    .as('issueSpans')

  return db
    .select(spansColumns)
    .from(spans)
    .innerJoin(
      issueSpans,
      and(
        eq(spans.id, issueSpans.spanId),
        eq(spans.traceId, issueSpans.traceId),
      ),
    )
    .where(
      and(
        eq(spans.workspaceId, workspaceId),
        eq(spans.status, SpanStatus.Ok),
        inArray(spans.type, spanTypes),
        ne(spans.source, LogSources.Optimization),
        experimentSourceFilter,
        cursorCondition,
      ),
    )
    .orderBy(desc(spans.startedAt), desc(spans.id))
    .limit(limit + 1)
}
