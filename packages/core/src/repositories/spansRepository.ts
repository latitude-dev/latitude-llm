import { parseJSON } from 'date-fns'
import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  SQL,
} from 'drizzle-orm'
import { cache as redis } from '../cache'
import {
  DEFAULT_PAGINATION_SIZE,
  LogSources,
  Span,
  SPAN_METADATA_CACHE_TTL,
  SPAN_METADATA_STORAGE_KEY,
  SpanMetadata,
  SpanType,
} from '../constants'
import { diskFactory, DiskWrapper } from '../lib/disk'
import { Result } from '../lib/Result'
import { commits } from '../schema/models/commits'
import { spans } from '../schema/models/spans'
import Repository from './repositoryV2'
import { CommitsRepository } from './commitsRepository'

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
    type,
    commitUuids,
    experimentUuids,
    createdAt,
  }: {
    documentUuid: string
    commitUuid?: string
    type?: SpanType
    commitUuids?: string[]
    experimentUuids?: string[]
    createdAt?: { from?: Date; to?: Date }
  }) {
    // Use a sampling approach for large tables to get an approximate count
    // This queries a percentage of the table using TABLESAMPLE
    const conditions = [
      this.scopeFilter,
      eq(spans.documentUuid, documentUuid),
      commitUuid ? eq(spans.commitUuid, commitUuid) : undefined,
      type ? eq(spans.type, type) : undefined,
    ].filter(Boolean) as SQL<unknown>[]

    // Add date range filter if provided
    if (createdAt?.from && createdAt?.to) {
      conditions.push(between(spans.startedAt, createdAt.from, createdAt.to))
    } else if (createdAt?.from) {
      conditions.push(gte(spans.startedAt, createdAt.from))
    } else if (createdAt?.to) {
      conditions.push(lte(spans.startedAt, createdAt.to))
    }

    // Add commit filter if provided - filter by commit UUIDs directly
    if (commitUuids && commitUuids.length > 0) {
      conditions.push(inArray(spans.commitUuid, commitUuids))
    }

    // Add experiment filter if provided - filter by experiment UUIDs directly
    if (experimentUuids && experimentUuids.length > 0) {
      conditions.push(inArray(spans.experimentUuid, experimentUuids))
    }

    const whereClause = and(...conditions)!

    try {
      // First, get the total table size to determine if we should sample
      const tableStatsResult = await this.db.execute(sql`
        SELECT reltuples::bigint AS estimate
        FROM pg_class
        WHERE relname = 'spans'
      `)

      interface TableStatsRow {
        estimate: string
      }

      const totalRows = parseInt(
        (tableStatsResult.rows[0] as unknown as TableStatsRow).estimate,
        10,
      )

      // For smaller tables (< 100k rows), do an actual count
      // For larger tables, use sampling
      if (totalRows < 100_000) {
        const countResult = await this.db
          .select({ count: count() })
          .from(spans)
          .where(whereClause)
          .then((r) => r[0])

        return Result.ok(countResult?.count ?? 0)
      }

      // For large tables, use a 10% sample and extrapolate
      const sampleResult = await this.db.execute(sql`
        SELECT COUNT(*) * 10 as estimated_count
        FROM ${spans} TABLESAMPLE BERNOULLI (10)
        WHERE ${whereClause}
      `)

      interface SampleRow {
        estimated_count: string
      }

      const estimatedCount = parseInt(
        (sampleResult.rows[0] as unknown as SampleRow).estimated_count,
        10,
      )

      return Result.ok(estimatedCount)
    } catch (_) {
      return Result.ok(null)
    }
  }

  async approximateCountByProject(projectId: number) {
    // Use a sampling approach for large tables to get an approximate count
    // This queries a percentage of the table using TABLESAMPLE
    const commitsRepo = new CommitsRepository(this.workspaceId)
    const commits = await commitsRepo
      .filterByProject(projectId)
      .then((r) => r.value)

    if (!commits.length) {
      return Result.ok(0)
    }

    const commitUuids = commits.map((c) => c.uuid)
    const whereClause = and(
      this.scopeFilter,
      inArray(spans.commitUuid, commitUuids),
    )

    try {
      // First, get the total table size to determine if we should sample
      const tableStatsResult = await this.db.execute(sql`
        SELECT reltuples::bigint AS estimate
        FROM pg_class
        WHERE relname = 'spans'
      `)

      interface TableStatsRow {
        estimate: string
      }

      const totalRows = parseInt(
        (tableStatsResult.rows[0] as unknown as TableStatsRow).estimate,
        10,
      )

      // For smaller tables (< 100k rows), do an actual count
      // For larger tables, use sampling
      if (totalRows < 100_000) {
        const countResult = await this.db
          .select({ count: count() })
          .from(spans)
          .where(whereClause)
          .then((r) => r[0])

        return Result.ok(countResult?.count ?? 0)
      }

      // For large tables, use a 10% sample and extrapolate
      const sampleResult = await this.db.execute(sql`
        SELECT COUNT(*) * 10 as estimated_count
        FROM ${spans} TABLESAMPLE BERNOULLI (10)
        WHERE ${whereClause}
      `)

      interface SampleRow {
        estimated_count: string
      }

      const estimatedCount = parseInt(
        (sampleResult.rows[0] as unknown as SampleRow).estimated_count,
        10,
      )

      return Result.ok(estimatedCount)
    } catch (_) {
      return Result.ok(null)
    }
  }

  async findByDocumentLogUuids(documentLogUuids: string[]) {
    return this.db
      .select()
      .from(spans)
      .where(inArray(spans.documentLogUuid, documentLogUuids))
      .then((r) => r as Span[])
  }

  async findByDocumentLogUuid(documentLogUuid: string) {
    const result = await this.db
      .select()
      .from(spans)
      .where(eq(spans.documentLogUuid, documentLogUuid))
      .then((r) => r[0])

    return result as Span | undefined
  }

  async findByDocumentAndCommitLimited({
    documentUuid,
    type,
    from,
    limit = DEFAULT_PAGINATION_SIZE,
    commitUuids,
    experimentUuids,
    createdAt,
  }: {
    documentUuid: string
    type?: SpanType
    from?: { startedAt: string; id: string }
    limit?: number
    commitUuids?: string[]
    experimentUuids?: string[]
    createdAt?: { from?: Date; to?: Date }
  }) {
    const conditions = [
      this.scopeFilter,
      eq(spans.documentUuid, documentUuid),
      type ? eq(spans.type, type) : undefined,
    ].filter(Boolean) as SQL<unknown>[]

    // Add date range filter if provided
    if (createdAt?.from && createdAt?.to) {
      conditions.push(between(spans.startedAt, createdAt.from, createdAt.to))
    } else if (createdAt?.from) {
      conditions.push(gte(spans.startedAt, createdAt.from))
    } else if (createdAt?.to) {
      conditions.push(lte(spans.startedAt, createdAt.to))
    }

    // Add commit filter if provided - filter by commit UUIDs directly
    if (commitUuids && commitUuids.length > 0) {
      conditions.push(inArray(spans.commitUuid, commitUuids))
    }

    // Add experiment filter if provided - filter by experiment UUIDs directly
    if (experimentUuids && experimentUuids.length > 0) {
      conditions.push(inArray(spans.experimentUuid, experimentUuids))
    }

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

  async findByProjectLimited({
    projectId,
    type,
    from,
    source,
    limit = DEFAULT_PAGINATION_SIZE,
  }: {
    projectId: number
    type?: SpanType
    from?: { startedAt: string; id: string }
    source?: LogSources[]
    limit?: number
  }) {
    const conditions = [
      this.scopeFilter,
      type ? eq(spans.type, type) : undefined,
      source
        ? or(inArray(spans.source, source), isNull(spans.source))
        : undefined,
      from
        ? sql`(${spans.startedAt}, ${spans.id}) < (${from.startedAt}, ${from.id})`
        : undefined,
    ].filter(Boolean) as SQL<unknown>[]

    const commitUuids = await this.db
      .select({ uuid: commits.uuid })
      .from(commits)
      .where(eq(commits.projectId, projectId))
      .then((r) => r.map((c) => c.uuid))

    if (commitUuids.length === 0) {
      return Result.ok({ items: [], next: null })
    }

    const result = await this.db
      .select(tt)
      .from(spans)
      .where(and(...conditions, inArray(spans.commitUuid, commitUuids)))
      .orderBy(desc(spans.startedAt), desc(spans.id))
      .limit(limit + 1)

    const hasMore = result.length > limit
    const items = hasMore ? result.slice(0, limit) : result
    const next = hasMore
      ? {
          startedAt: items[items.length - 1].startedAt.toISOString(),
          id: items[items.length - 1].id,
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

  async findByParentAndType({
    parentId,
    type,
  }: {
    parentId: string
    type: SpanType
  }) {
    return await this.db
      .select()
      .from(spans)
      .where(and(eq(spans.parentId, parentId), eq(spans.type, type)))
  }

  async findBySpanAndTraceIds(
    spanTraceIdPairs: Array<{ spanId: string; traceId: string }>,
  ) {
    if (spanTraceIdPairs.length === 0) {
      return Result.ok<Span[]>([])
    }

    // Build OR conditions for each span/trace pair
    const conditions = spanTraceIdPairs.map(({ spanId, traceId }) =>
      and(eq(spans.id, spanId), eq(spans.traceId, traceId)),
    )

    const result = await this.db
      .select(tt)
      .from(spans)
      .where(and(this.scopeFilter, sql`(${sql.join(conditions, sql` OR `)})`)!)
      .orderBy(asc(spans.startedAt), asc(spans.id))

    return Result.ok<Span[]>(result as Span[])
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
