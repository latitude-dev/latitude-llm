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
  LogSources,
  MAIN_SPAN_TYPES,
  MainSpanType,
  Span,
  SpanStatus,
} from '../../constants'
import { Result } from '../../lib/Result'
import { CommitsRepository } from '../../repositories'
import { experiments } from '../../schema/models/experiments'
import { optimizations } from '../../schema/models/optimizations'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { getSpansByDocument as chGetSpansByDocument } from '../../queries/clickhouse/spans/getByDocument'

/**
 * Fetches OK spans from a document, ordered by startedAt descending.
 *
 * Automatically excludes optimization-related spans:
 * - Spans with source 'optimization'
 * - Spans with source 'experiment' where the experiment is linked
 *   to an optimization (via baselineExperimentId or optimizedExperimentId)
 *
 * @param spanTypes - Array of span types to include. Defaults to all main span types.
 */
export async function getSpansByDocument(
  {
    workspace,
    commit,
    document,
    spanTypes = Array.from(MAIN_SPAN_TYPES) as MainSpanType[],
    cursor,
    limit = 25,
  }: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
    spanTypes?: MainSpanType[]
    cursor: Cursor<Date, string> | null
    limit?: number
  },
  db = database,
) {
  const clickhouseEnabledResult = await isFeatureEnabledByName(
    workspace.id,
    'clickhouse-spans-read',
    db,
  )
  const shouldUseClickHouse =
    clickhouseEnabledResult.ok && clickhouseEnabledResult.value

  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
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

  if (shouldUseClickHouse) {
    const optimizationExperimentRows = await optimizationExperimentUuids
    return Result.ok(
      await chGetSpansByDocument({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        spanTypes,
        commitUuids,
        optimizationExperimentUuids: optimizationExperimentRows.map(
          (row) => row.uuid,
        ),
        cursor,
        limit,
      }),
    )
  }

  const rows = await db
    .select(spansColumns)
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        eq(spans.documentUuid, document.documentUuid),
        inArray(spans.type, spanTypes),
        eq(spans.status, SpanStatus.Ok),
        inArray(spans.commitUuid, commitUuids),
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
