import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import {
  Span,
  SPAN_METADATA_CACHE_TTL,
  SPAN_METADATA_STORAGE_KEY,
  SpanMetadata,
  SpanType,
} from '../browser'
import { cache as redis } from '../cache'
import { diskFactory, DiskWrapper } from '../lib/disk'
import { Result } from '../lib/Result'
import { spans } from '../schema'
import Repository from './repositoryV2'
import { parseJSON } from 'date-fns'

const tt = getTableColumns(spans)

export class SpansRepository extends Repository<Span> {
  get scopeFilter() {
    return eq(spans.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(spans)
      .where(this.scopeFilter)
      .orderBy(asc(spans.startedAt), asc(spans.id))
      .$dynamic()
  }

  async get({ spanId, traceId }: { spanId: string; traceId: string }) {
    const result = await this.scope
      .where(
        and(this.scopeFilter, eq(spans.traceId, traceId), eq(spans.id, spanId)),
      )
      .limit(1)
      .then((r) => r[0])

    if (!result) return Result.nil()
    return Result.ok<Span>(result as Span)
  }

  async list({ traceId }: { traceId: string }) {
    const result = await this.db
      .select(tt)
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.traceId, traceId)))
      .orderBy(asc(spans.startedAt), asc(spans.id))

    return Result.ok<Span[]>(result as Span[])
  }

  async listTracesByLog(documentLogUuid: string) {
    const result = await this.db
      .select({
        traceId: spans.traceId,
        startedAt: sql`max(${spans.startedAt})`.mapWith(parseJSON),
      })
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.documentLogUuid, documentLogUuid)))
      .groupBy(spans.traceId)
      .orderBy(desc(sql`max(${spans.startedAt})`))
      .then((r) => r.map((r) => r.traceId))

    return result as string[]
  }
}

export class SpanMetadatasRepository {
  protected workspaceId: number
  protected disk: DiskWrapper

  constructor(workspaceId: number, disk: DiskWrapper = diskFactory('private')) {
    this.workspaceId = workspaceId
    this.disk = disk
  }

  async get<T extends SpanType = SpanType>({
    spanId,
    traceId,
    fresh,
  }: {
    spanId: string
    traceId: string
    fresh?: boolean
  }) {
    const key = SPAN_METADATA_STORAGE_KEY(this.workspaceId, traceId, spanId)
    const cache = await redis()

    try {
      let payload = fresh ? undefined : await cache.get(key)
      if (!payload) payload = await this.disk.get(key)

      const metadata = JSON.parse(payload)

      await cache.set(key, payload, 'EX', SPAN_METADATA_CACHE_TTL)

      return Result.ok<SpanMetadata<T>>(metadata)
    } catch {
      return Result.nil()
    }
  }

  async invalidate({ spanId, traceId }: { spanId: string; traceId: string }) {
    const key = SPAN_METADATA_STORAGE_KEY(this.workspaceId, traceId, spanId)
    const cache = await redis()

    try {
      await cache.del(key)
      return Result.nil()
    } catch {
      return Result.nil()
    }
  }
}
