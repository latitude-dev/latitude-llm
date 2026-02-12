import { and, asc, eq, inArray } from 'drizzle-orm'

import { Span } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery, unscopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const unsafelyFindSpansByDocumentLogUuids = unscopedQuery(
  async function unsafelyFindSpansByDocumentLogUuids(
    { documentLogUuids }: { documentLogUuids: string[] },
    db,
  ): Promise<Span[]> {
    return db
      .select()
      .from(spans)
      .where(inArray(spans.documentLogUuid, documentLogUuids))
      .then((r) => r as Span[])
  },
)

export const findSpanIdentifiersByDocumentLogUuids = scopedQuery(
  async function findSpanIdentifiersByDocumentLogUuids(
    {
      workspaceId,
      documentLogUuids,
    }: { workspaceId: number; documentLogUuids: string[] },
    db,
  ): Promise<{ traceId: string; spanId: string }[]> {
    if (documentLogUuids.length === 0) return []

    return db
      .select({ traceId: spans.traceId, spanId: spans.id })
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          inArray(spans.documentLogUuid, documentLogUuids),
        ),
      )
      .then((r) =>
        r.map((row) => ({ traceId: row.traceId, spanId: row.spanId })),
      )
  },
)

export const unsafelyFindSpanByDocumentLogUuid = unscopedQuery(
  async function unsafelyFindSpanByDocumentLogUuid(
    { documentLogUuid }: { documentLogUuid: string },
    db,
  ): Promise<Span | undefined> {
    const result = await db
      .select()
      .from(spans)
      .where(eq(spans.documentLogUuid, documentLogUuid))
      .then((r) => r[0])
    return result as Span | undefined
  },
)

export const findAllSpansByDocumentLogUuid = scopedQuery(
  async function findAllSpansByDocumentLogUuid(
    {
      workspaceId,
      documentLogUuid,
    }: { workspaceId: number; documentLogUuid: string },
    db,
  ): Promise<Span[]> {
    return db
      .select()
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(spans.documentLogUuid, documentLogUuid),
        ),
      )
      .orderBy(asc(spans.startedAt), asc(spans.id))
      .then((r) => r as Span[])
  },
)
