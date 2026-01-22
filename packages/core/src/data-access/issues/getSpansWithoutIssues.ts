import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import { database } from '../../client'
import { MainSpanType, Span, SpanStatus, SpanType } from '../../constants'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { issues } from '../../schema/models/issues'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'

// BONUS(AO/OPT): Should we only return spans without issues and at least one positive HITL result?
// BONUS(AO/OPT): Instead of filtering all experiments, only filter experiments from optimizations?

/**
 * Fetches spans that have no issues associated through evaluation results,
 * filtered by document and commit history.
 *
 * @param spanTypes - Array of span types to include. Defaults to [SpanType.Prompt]
 *                    for backward compatibility (optimizer requires Prompt-only).
 */
export async function getSpansWithoutIssues(
  {
    workspace,
    commit,
    document,
    includeExperiments = true,
    excludeFailedResults = false,
    spanTypes = [SpanType.Prompt],
    cursor,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
    includeExperiments?: boolean
    excludeFailedResults?: boolean
    spanTypes?: MainSpanType[]
    cursor: Cursor<Date, string> | null
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
        or(
          isNotNull(evaluationResultsV2.error),
          sql`${evaluationResultsV2.hasPassed} IS NOT TRUE`,
        ),
      ),
    )
    .as('spansWithFailedResults')

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
        ...(!includeExperiments ? [isNull(spans.experimentUuid)] : []),
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
