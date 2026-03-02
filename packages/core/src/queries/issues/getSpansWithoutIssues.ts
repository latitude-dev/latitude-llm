import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
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
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { experiments } from '../../schema/models/experiments'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { issues } from '../../schema/models/issues'
import { optimizations } from '../../schema/models/optimizations'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'
import { isClickHouseSpansReadEnabled } from '../../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import {
  getSpansWithoutIssues as chGetSpansWithoutIssues,
  getSpansWithActiveIssues as chGetSpansWithActiveIssues,
  getSpansWithFailedResults as chGetSpansWithFailedResults,
  getSpansWithPassedResults as chGetSpansWithPassedResults,
} from '../../queries/clickhouse/spans/getSpansWithoutIssues'

/**
 * Fetches spans that have no issues associated through evaluation results,
 * filtered by document and commit history.
 *
 * Automatically excludes optimization-related spans:
 * - Spans with source 'optimization'
 * - Spans with source 'experiment' where the experiment is linked
 *   to an optimization (via baselineExperimentId or optimizedExperimentId)
 *
 * @param excludeFailedResults - When true, excludes spans with failed or errored evaluation results.
 * @param requirePassedResults - When true, only returns spans with at least one
 *   evaluation result where hasPassed IS TRUE.
 * @param requirePassedAnnotations - When true, implies requirePassedResults and
 *   only returns spans with at least one human evaluation result where hasPassed IS TRUE.
 * @param spanTypes - Array of span types to include. Defaults to all main span types.
 *                    Pass [SpanType.Prompt] for optimizer use cases.
 */
export async function getSpansWithoutIssues(
  {
    workspace,
    commit,
    document,
    excludeFailedResults = false,
    requirePassedResults = false,
    requirePassedAnnotations = false,
    spanTypes = Array.from(MAIN_SPAN_TYPES) as MainSpanType[],
    cursor = null,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
    excludeFailedResults?: boolean
    requirePassedResults?: boolean
    requirePassedAnnotations?: boolean
    spanTypes?: MainSpanType[]
    cursor?: Cursor<Date, string> | null
    limit?: number
  },
  db = database,
) {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)
  const commitUuids = commitHistory.map((c) => c.uuid)

  if (commitHistory.length === 0) {
    return Result.ok({
      spans: [] as Span<MainSpanType>[],
      next: null,
    })
  }

  const shouldUseClickHouse = await isClickHouseSpansReadEnabled(
    workspace.id,
    db,
  )

  // Get optimization experiment UUIDs (still from PostgreSQL)
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

  if (shouldUseClickHouse) {
    // Get active issue IDs and their evaluation result IDs from PostgreSQL
    const activeIssueEvaluationResults = await db
      .select({
        evaluationResultId: issueEvaluationResults.evaluationResultId,
      })
      .from(issueEvaluationResults)
      .innerJoin(issues, eq(issueEvaluationResults.issueId, issues.id))
      .where(
        and(
          eq(issueEvaluationResults.workspaceId, workspace.id),
          eq(issues.documentUuid, document.documentUuid),
          isNull(issues.ignoredAt),
        ),
      )

    const evaluationResultIds = activeIssueEvaluationResults.map(
      (r) => r.evaluationResultId,
    )

    // Get excluded span/trace IDs from ClickHouse
    const [excludedFromIssues, excludedFromFailed, includedFromPassed] =
      await Promise.all([
        evaluationResultIds.length > 0
          ? chGetSpansWithActiveIssues({
              workspaceId: workspace.id,
              evaluationResultIds,
            })
          : Promise.resolve({
              spanIds: [] as string[],
              traceIds: [] as string[],
            }),
        excludeFailedResults
          ? chGetSpansWithFailedResults({
              workspaceId: workspace.id,
              documentUuid: document.documentUuid,
              commitUuids,
            })
          : Promise.resolve({
              spanIds: [] as string[],
              traceIds: [] as string[],
            }),
        requirePassedResults || requirePassedAnnotations
          ? chGetSpansWithPassedResults({
              workspaceId: workspace.id,
              documentUuid: document.documentUuid,
              commitUuids,
              requireHumanEvaluation: requirePassedAnnotations,
            })
          : Promise.resolve({
              spanIds: [] as string[],
              traceIds: [] as string[],
            }),
      ])

    // Combine exclusions
    const excludedSpanIds = new Set([
      ...excludedFromIssues.spanIds,
      ...excludedFromFailed.spanIds,
    ])
    const excludedTraceIds = new Set([
      ...excludedFromIssues.traceIds,
      ...excludedFromFailed.traceIds,
    ])

    // If we require passed results, only include those spans
    let requiredSpanIds: string[] | undefined
    let requiredTraceIds: string[] | undefined
    if (requirePassedResults || requirePassedAnnotations) {
      requiredSpanIds = includedFromPassed.spanIds
      requiredTraceIds = includedFromPassed.traceIds
      // If no spans have passed results, return empty
      if (requiredSpanIds.length === 0) {
        return Result.ok({
          spans: [] as Span<MainSpanType>[],
          next: null,
        })
      }
    }

    // Query ClickHouse for the actual spans
    const result = await chGetSpansWithoutIssues({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids,
      spanTypes,
      excludedSpanIds:
        excludedSpanIds.size > 0 ? Array.from(excludedSpanIds) : undefined,
      excludedTraceIds:
        excludedTraceIds.size > 0 ? Array.from(excludedTraceIds) : undefined,
      optimizationExperimentUuids,
      cursor,
      limit,
    })

    // Filter by required span/trace IDs if needed
    let filteredSpans = result.spans
    if (requiredSpanIds && requiredTraceIds) {
      const requiredSpanSet = new Set(requiredSpanIds)
      const requiredTraceSet = new Set(requiredTraceIds)
      filteredSpans = result.spans.filter(
        (span) =>
          requiredSpanSet.has(span.id) || requiredTraceSet.has(span.traceId),
      )
    }

    return Result.ok({
      spans: filteredSpans,
      next: result.next,
    })
  }

  const spansColumns = getTableColumns(spans)

  const cursorConditions = cursor
    ? sql`(${spans.startedAt}, ${spans.id}) < (${cursor.value}, ${cursor.id})`
    : undefined

  const spansWithActiveIssues = db
    .selectDistinct({
      spanId: evaluationResultsV2.evaluatedSpanId,
      traceId: evaluationResultsV2.evaluatedTraceId,
    })
    .from(issueEvaluationResults)
    .innerJoin(
      evaluationResultsV2,
      eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
    )
    .innerJoin(issues, eq(issueEvaluationResults.issueId, issues.id))
    .where(
      and(
        eq(issueEvaluationResults.workspaceId, workspace.id),
        eq(issues.documentUuid, document.documentUuid),
        inArray(evaluationResultsV2.commitId, commitIds),
        isNull(issues.ignoredAt),
      ),
    )
    .as('spansWithActiveIssues')

  const spansWithFailedResults = db
    .selectDistinct({
      spanId: evaluationResultsV2.evaluatedSpanId,
      traceId: evaluationResultsV2.evaluatedTraceId,
    })
    .from(evaluationResultsV2)
    .where(
      and(
        eq(evaluationResultsV2.workspaceId, workspace.id),
        inArray(evaluationResultsV2.commitId, commitIds),
        sql`${evaluationResultsV2.hasPassed} IS NOT TRUE`,
      ),
    )
    .as('spansWithFailedResults')

  const effectiveRequirePassedResults =
    requirePassedResults || requirePassedAnnotations

  const spansWithPassedResults = db
    .selectDistinct({
      spanId: evaluationResultsV2.evaluatedSpanId,
      traceId: evaluationResultsV2.evaluatedTraceId,
    })
    .from(evaluationResultsV2)
    .where(
      and(
        eq(evaluationResultsV2.workspaceId, workspace.id),
        inArray(evaluationResultsV2.commitId, commitIds),
        sql`${evaluationResultsV2.hasPassed} IS TRUE`,
        ...(requirePassedAnnotations ? [eq(evaluationResultsV2.type, EvaluationType.Human)] : []), // prettier-ignore
      ),
    )
    .as('spansWithPassedResults')

  let query = db
    .select(spansColumns)
    .from(spans)
    .leftJoin(
      spansWithActiveIssues,
      and(
        eq(spans.id, spansWithActiveIssues.spanId),
        eq(spans.traceId, spansWithActiveIssues.traceId),
      ),
    )

  if (excludeFailedResults) {
    query = query.leftJoin(
      spansWithFailedResults,
      and(
        eq(spans.id, spansWithFailedResults.spanId),
        eq(spans.traceId, spansWithFailedResults.traceId),
      ),
    )
  }

  if (effectiveRequirePassedResults) {
    query = query.innerJoin(
      spansWithPassedResults,
      and(
        eq(spans.id, spansWithPassedResults.spanId),
        eq(spans.traceId, spansWithPassedResults.traceId),
      ),
    )
  }

  const rows = await query
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        eq(spans.documentUuid, document.documentUuid),
        inArray(spans.type, spanTypes),
        eq(spans.status, SpanStatus.Ok),
        inArray(spans.commitUuid, commitUuids),
        isNull(spansWithActiveIssues.spanId),
        ...(excludeFailedResults ? [isNull(spansWithFailedResults.spanId)] : []), // prettier-ignore
        ne(spans.source, LogSources.Optimization),
        or(
          ne(spans.source, LogSources.Experiment),
          isNull(spans.experimentUuid),
          notInArray(spans.experimentUuid, optimizationExperimentUuids),
        ),
        cursorConditions,
      ),
    )
    .orderBy(desc(spans.startedAt), desc(spans.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const paginatedSpans = hasMore ? rows.slice(0, limit) : rows

  const lastItem =
    paginatedSpans.length > 0 ? paginatedSpans[paginatedSpans.length - 1] : null
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
