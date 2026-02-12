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

import {
  LogSources,
  MAIN_SPAN_TYPES,
  MainSpanType,
  Span,
  SpanStatus,
} from '../../constants'
import { CommitsRepository } from '../../repositories'
import { experiments } from '../../schema/models/experiments'
import { optimizations } from '../../schema/models/optimizations'
import { spans } from '../../schema/models/spans'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Cursor } from '../../schema/types'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const getSpansByDocument = scopedQuery(
  async function getSpansByDocument(
    {
      workspaceId,
      commit,
      document,
      spanTypes = Array.from(MAIN_SPAN_TYPES) as MainSpanType[],
      cursor,
      limit = 25,
    }: {
      workspaceId: number
      commit: Commit
      document: DocumentVersion
      spanTypes?: MainSpanType[]
      cursor: Cursor<Date, string> | null
      limit?: number
    },
    db,
  ): Promise<{ spans: Span<MainSpanType>[]; next: Cursor<Date, string> | null }> {
    const commitsRepo = new CommitsRepository(workspaceId, db)
    const commitHistory = await commitsRepo.getCommitsHistory({ commit })
    const commitUuids = commitHistory.map((c) => c.uuid)

    if (commitHistory.length === 0) {
      return { spans: [], next: null }
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

    const rows = await db
      .select(spansColumns)
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
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
      paginatedSpans.length > 0
        ? paginatedSpans[paginatedSpans.length - 1]
        : null
    const next: Cursor<Date, string> | null =
      hasMore && lastItem
        ? { value: lastItem.startedAt, id: lastItem.id }
        : null

    return {
      spans: paginatedSpans as Span<MainSpanType>[],
      next,
    }
  },
)
