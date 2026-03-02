import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { database } from '../../client'
import {
  MAIN_SPAN_TYPES,
  MainSpanType,
  Span,
  SpanStatus,
} from '../../constants'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories/commitsRepository'
import { SpansRepository } from '../../repositories/spansRepository'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'
import { isClickHouseSpansReadEnabled } from '../../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import { listSpanPairsByIssue } from '../clickhouse/evaluationResultsV2/listSpanPairsByIssue'

export async function getSpansByIssue(
  {
    workspace,
    commit,
    issue,
    spanTypes = Array.from(MAIN_SPAN_TYPES) as MainSpanType[],
    cursor = null,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    spanTypes?: MainSpanType[]
    cursor?: Cursor<string, string> | null
    limit?: number
  },
  db = database,
) {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const spansRepository = new SpansRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)

  if (commitIds.length === 0) {
    return Result.ok({
      spans: [] as Span<MainSpanType>[],
      next: null,
    })
  }

  const useClickHouseSpans = await isClickHouseSpansReadEnabled(
    workspace.id,
    db,
  )

  const spanPairs = useClickHouseSpans
    ? await listSpanPairsByIssue(
        {
          workspaceId: workspace.id,
          projectId: commit.projectId,
          issueId: issue.id,
          commitUuids: commitHistory.map((c) => c.uuid),
          cursor,
          limit,
        },
        db,
      )
    : await getSpanPairsFromPostgres({
        workspaceId: workspace.id,
        issueId: issue.id,
        commitIds,
        cursor,
        limit,
        db,
      })

  const hasMore = spanPairs.length > limit
  const paginatedPairs = hasMore ? spanPairs.slice(0, limit) : spanPairs
  const spansByIssue = await spansRepository.findByEvaluationResults(
    paginatedPairs.map((pair) => ({
      evaluatedSpanId: pair.spanId,
      evaluatedTraceId: pair.traceId,
    })),
  )

  const filteredSpans = spansByIssue.filter(
    (span) =>
      span.status === SpanStatus.Ok &&
      spanTypes.includes(span.type as MainSpanType),
  )

  const lastItem = paginatedPairs.at(-1)
  const next: Cursor<string, string> | null =
    hasMore && lastItem
      ? {
          value: lastItem.traceId,
          id: lastItem.spanId,
        }
      : null

  return Result.ok({
    spans: filteredSpans as Span<MainSpanType>[],
    next,
  })
}

async function getSpanPairsFromPostgres({
  workspaceId,
  issueId,
  commitIds,
  cursor,
  limit,
  db,
}: {
  workspaceId: number
  issueId: number
  commitIds: number[]
  cursor: Cursor<string, string> | null
  limit: number
  db: typeof database
}) {
  const cursorConditions = cursor
    ? sql`(${evaluationResultsV2.evaluatedTraceId}, ${evaluationResultsV2.evaluatedSpanId}) < (${cursor.value}, ${cursor.id})`
    : undefined

  const rows = await db
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
        cursorConditions,
      ),
    )
    .orderBy(
      desc(evaluationResultsV2.evaluatedTraceId),
      desc(evaluationResultsV2.evaluatedSpanId),
    )
    .limit(limit + 1)

  return rows.map((row) => ({
    spanId: row.spanId!,
    traceId: row.traceId!,
  }))
}
