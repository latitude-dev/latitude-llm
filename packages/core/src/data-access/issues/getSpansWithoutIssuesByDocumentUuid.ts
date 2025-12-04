import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notExists,
  sql,
} from 'drizzle-orm'
import { calculateOffset } from '../../lib/pagination'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { spans } from '../../schema/models/spans'
import { Span, SpanType } from '@latitude-data/constants'
import { database } from '../../client'

async function fetchPaginatedSpans(
  {
    workspace,
    commit,
    documentUuid,
    page,
    pageSize,
  }: {
    workspace: Workspace
    commit: Commit
    documentUuid: string
    page: number
    pageSize: number
  },
  db = database,
) {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commitHistory.map((c) => c.id)
  const commitUuids = commitHistory.map((c) => c.uuid)
  const limit = pageSize + 1
  const offset = calculateOffset(page, pageSize)

  const fetchedSpans = await db
    .select({
      id: spans.id,
      traceId: spans.traceId,
      createdAt: spans.createdAt,
    })
    .from(spans)
    .innerJoin(commits, eq(commits.uuid, spans.commitUuid))
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        eq(spans.documentUuid, documentUuid),
        eq(spans.type, SpanType.Prompt),
        isNull(commits.deletedAt),
        inArray(spans.commitUuid, commitUuids),
        // Exclude spans that have evaluation results linked to issues
        notExists(
          db
            .select()
            .from(issueEvaluationResults)
            .innerJoin(
              evaluationResultsV2,
              eq(
                issueEvaluationResults.evaluationResultId,
                evaluationResultsV2.id,
              ),
            )
            .where(
              and(
                eq(issueEvaluationResults.workspaceId, workspace.id),
                eq(evaluationResultsV2.evaluatedSpanId, spans.id),
                eq(evaluationResultsV2.evaluatedTraceId, spans.traceId),
                isNotNull(evaluationResultsV2.evaluatedSpanId),
                isNotNull(evaluationResultsV2.evaluatedTraceId),
                inArray(evaluationResultsV2.commitId, commitIds),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(spans.createdAt), desc(spans.id))
    .limit(limit)
    .offset(offset)

  const hasNextPage = fetchedSpans.length > pageSize
  const results = hasNextPage ? fetchedSpans.slice(0, pageSize) : fetchedSpans
  return { results, hasNextPage }
}

/**
 * Fetches spans associated with a document UUID that are NOT linked to any issues,
 * filtered by specific commits and paginated.
 *
 * This function queries spans directly from the spans table, filtering by documentUuid
 * and excluding spans that have evaluation results associated with issues through
 * the issueEvaluationResults table.
 */
export async function getSpansWithoutIssuesByDocumentUuid(
  {
    workspace,
    commit,
    documentUuid,
    page,
    pageSize,
  }: {
    workspace: Workspace
    commit: Commit
    documentUuid: string
    page: number
    pageSize: number
  },
  db = database,
) {
  const { results: paginatedResults, hasNextPage } = await fetchPaginatedSpans(
    {
      workspace,
      commit,
      documentUuid,
      page,
      pageSize,
    },
    db,
  )

  if (paginatedResults.length === 0) {
    return Result.ok({
      spans: [] as Span[],
      hasNextPage: false,
    })
  }

  const spanTraceIdPairs = paginatedResults.map(
    (result) => sql`(${result.id}, ${result.traceId})`,
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
      const key = `${result.id}:${result.traceId}`
      return spanMap.get(key)
    })
    .filter((span): span is Span => span !== undefined)

  return Result.ok({
    spans: orderedSpans,
    hasNextPage,
  })
}
