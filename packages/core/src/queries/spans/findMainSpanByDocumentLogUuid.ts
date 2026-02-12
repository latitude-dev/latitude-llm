import { and, asc, desc, eq, or } from 'drizzle-orm'

import { Span, SpanType } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

const mainSpanTypeFilter = or(
  eq(spans.type, SpanType.Prompt),
  eq(spans.type, SpanType.Chat),
  eq(spans.type, SpanType.External),
)

export const findLastMainSpanByDocumentLogUuid = scopedQuery(
  async function findLastMainSpanByDocumentLogUuid(
    {
      workspaceId,
      documentLogUuid,
    }: { workspaceId: number; documentLogUuid: string },
    db,
  ): Promise<Span | undefined> {
    const result = await db
      .select()
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(spans.documentLogUuid, documentLogUuid),
          mainSpanTypeFilter,
        ),
      )
      .orderBy(desc(spans.startedAt))
      .limit(1)
      .then((r) => r[0])
    return result as Span | undefined
  },
)

export const findFirstMainSpanByDocumentLogUuid = scopedQuery(
  async function findFirstMainSpanByDocumentLogUuid(
    {
      workspaceId,
      documentLogUuid,
    }: { workspaceId: number; documentLogUuid: string },
    db,
  ): Promise<Span | undefined> {
    const result = await db
      .select()
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(spans.documentLogUuid, documentLogUuid),
          mainSpanTypeFilter,
        ),
      )
      .orderBy(asc(spans.startedAt))
      .limit(1)
      .then((r) => r[0])
    return result as Span | undefined
  },
)

export const isFirstMainSpanInConversation = scopedQuery(
  async function isFirstMainSpanInConversation(
    {
      workspaceId,
      documentLogUuid,
      spanId,
      traceId,
    }: {
      workspaceId: number
      documentLogUuid: string
      spanId: string
      traceId: string
    },
    db,
  ): Promise<boolean> {
    const firstSpan = await findFirstMainSpanByDocumentLogUuid(
      { workspaceId, documentLogUuid },
      db,
    )
    return firstSpan?.id === spanId && firstSpan?.traceId === traceId
  },
)
