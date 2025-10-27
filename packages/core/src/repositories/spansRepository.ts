import { parseJSON } from 'date-fns'
import { and, asc, desc, eq, getTableColumns, sql, SQL } from 'drizzle-orm'
import { cache as redis } from '../cache'
import {
  DEFAULT_PAGINATION_SIZE,
  Span,
  SPAN_METADATA_CACHE_TTL,
  SPAN_METADATA_STORAGE_KEY,
  SpanMetadata,
  SpanType,
} from '../constants'
import { diskFactory, DiskWrapper } from '../lib/disk'
import { Result } from '../lib/Result'
import { spans } from '../schema/models/spans'
import Repository from './repositoryV2'

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

  async approximateCount({
    documentUuid,
    commitUuid,
  }: {
    documentUuid: string
    commitUuid: string
  }) {
    // Use PostgreSQL's EXPLAIN to get an approximate row count
    // This is much faster than COUNT(*) on large tables
    const explainResult = await this.db.execute(sql`
      EXPLAIN SELECT COUNT(*)
      FROM ${spans}
      WHERE ${this.scopeFilter}
        AND ${eq(spans.documentUuid, documentUuid)}
        AND ${eq(spans.commitUuid, commitUuid)}
    `)

    interface ExplainPlanRow {
      'QUERY PLAN': Array<{
        Plan: {
          'Plan Rows': number
        }
      }>
    }

    const explainPlan = explainResult.rows[0] as unknown as ExplainPlanRow
    const plan = explainPlan['QUERY PLAN'][0].Plan
    if (!plan) return Result.ok(null)

    // Extract the estimated row count from the plan
    const estimatedRows = plan['Plan Rows'] ?? null

    return Result.ok(estimatedRows)
  }

  async findByDocumentAndCommitLimited({
    documentUuid,
    commitUuid,
    type,
    from,
    limit = DEFAULT_PAGINATION_SIZE,
  }: {
    documentUuid: string
    commitUuid: string
    type?: SpanType
    from?: { startedAt: string; id: string }
    limit?: number
  }) {
    const conditions = [
      this.scopeFilter,
      eq(spans.documentUuid, documentUuid),
      eq(spans.commitUuid, commitUuid),
      type ? eq(spans.type, type) : undefined,
    ].filter(Boolean) as SQL<unknown>[]

    // Filter by cursor if provided (same pattern as document logs)
    const cursorConditions = [
      ...conditions,
      from
        ? sql`(${spans.startedAt}, ${spans.id}) < (${from.startedAt}, ${from.id})`
        : undefined,
    ].filter(Boolean) as SQL<unknown>[]

    const result = await this.db
      .select(tt)
      .from(spans)
      .where(and(...cursorConditions))
      .orderBy(desc(spans.startedAt), desc(spans.id))
      .limit(limit + 1)

    const hasMore = result.length > limit
    const items = hasMore ? result.slice(0, limit) : result
    const next = hasMore
      ? {
          startedAt: result[limit - 1].startedAt.toISOString(),
          id: result[limit - 1].id,
        }
      : null

    return Result.ok<{
      items: Span[]
      next: { startedAt: string; id: string } | null
    }>({
      items: items as Span[],
      next,
    })
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
