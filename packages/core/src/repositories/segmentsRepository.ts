import { max, min, parseJSON } from 'date-fns'
import { and, asc, desc, eq, getTableColumns, or, sql, type SQL } from 'drizzle-orm'
import {
  type Segment,
  SEGMENT_METADATA_CACHE_TTL,
  SEGMENT_METADATA_STORAGE_KEY,
  type SegmentMetadata,
  SegmentType,
  SpanStatus,
  SpanType,
} from '../browser'
import { cache as redis } from '../cache'
import { diskFactory, type DiskWrapper } from '../lib/disk'
import { ConflictError, databaseErrorCodes } from '../lib/errors'
import { Result } from '../lib/Result'
import { segments, spans } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(segments)

export class SegmentsRepository extends Repository<Segment> {
  get scopeFilter() {
    return eq(segments.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(segments)
      .where(this.scopeFilter)
      .orderBy(asc(segments.startedAt), asc(segments.id))
      .$dynamic()
  }

  async get({ segmentId, traceId }: { segmentId: string; traceId: string }) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(segments.traceId, traceId), eq(segments.id, segmentId)))
      .limit(1)
      .then((r) => r[0])

    if (!result) return Result.nil()
    return Result.ok<Segment>(result as Segment)
  }

  async list({ traceId }: { traceId: string }) {
    const result = await this.db
      .select(tt)
      .from(segments)
      .where(and(this.scopeFilter, eq(segments.traceId, traceId)))
      .orderBy(asc(segments.startedAt), asc(segments.id))

    return Result.ok<Segment[]>(result as Segment[])
  }

  async lock({ segmentId, traceId, wait }: { segmentId: string; traceId: string; wait?: boolean }) {
    try {
      await this.db
        .select({ id: segments.id })
        .from(segments)
        .where(and(this.scopeFilter, eq(segments.traceId, traceId), eq(segments.id, segmentId)))
        .limit(1)
        .for('no key update', wait ? undefined : { noWait: true })
    } catch (error: any) {
      if (error?.code === databaseErrorCodes.lockNotAvailable) {
        return Result.error(new ConflictError('Cannot obtain lock on segment'))
      }
      return Result.error(error as Error)
    }

    return Result.nil()
  }

  timestampsQuery({
    segmentId,
    traceId,
    table: name,
    filters,
  }: {
    segmentId: string
    traceId: string
    table: 'spans' | 'segments'
    filters?: SQL<unknown>[]
  }) {
    const table = name === 'spans' ? spans : segments

    const query = this.db
      .select({
        first: sql`min(${table.startedAt})`.mapWith(parseJSON),
        last: sql`max(${table.startedAt})`.mapWith(parseJSON),
      })
      .from(table)
      .where(
        and(
          ...[
            eq(table.workspaceId, this.workspaceId),
            eq(table.traceId, traceId),
            name === 'spans' ? eq(spans.segmentId, segmentId) : eq(segments.parentId, segmentId),
            ...(filters ?? []),
          ],
        ),
      )
      .groupBy(name === 'spans' ? spans.segmentId : segments.parentId)

    return query
  }

  compareTimestamps({
    spans,
    segments,
  }: {
    spans?: { first: Date; last: Date }
    segments?: { first: Date; last: Date }
  }) {
    let first: Date | undefined
    let last: Date | undefined

    if (spans?.first && !segments?.first) first = spans.first
    else if (segments?.first && !spans?.first) first = segments.first
    else if (spans?.first && segments?.first) first = min([spans.first, segments.first])

    if (spans?.last && !segments?.last) last = spans.last
    else if (segments?.last && !spans?.last) last = segments.last
    else if (spans?.last && segments?.last) last = max([spans.last, segments.last])

    return { first, last }
  }

  async getTimestamps({ segmentId, traceId }: { segmentId: string; traceId: string }) {
    const [children, completions, documents, errors] = await Promise.all([
      (async () => {
        const spansts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'spans',
        }).then((r) => r[0])
        const segmentsts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'segments',
        }).then((r) => r[0])
        return this.compareTimestamps({ spans: spansts, segments: segmentsts })
      })(),
      (async () => {
        const spansts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'spans',
          filters: [eq(spans.type, SpanType.Completion)],
        }).then((r) => r[0])
        const segmentsts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'segments',
          filters: [
            or(eq(segments.type, SegmentType.Document), eq(segments.type, SegmentType.Step))!,
          ],
        }).then((r) => r[0])
        return this.compareTimestamps({ spans: spansts, segments: segmentsts })
      })(),
      (async () => {
        const spansts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'spans',
          filters: [eq(spans.type, SpanType.Segment)],
        }).then((r) => r[0])
        const segmentsts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'segments',
          filters: [eq(segments.type, SegmentType.Document)],
        }).then((r) => r[0])
        return this.compareTimestamps({ spans: spansts, segments: segmentsts })
      })(),
      (async () => {
        const spansts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'spans',
          filters: [eq(spans.status, SpanStatus.Error)],
        }).then((r) => r[0])
        const segmentsts = await this.timestampsQuery({
          segmentId: segmentId,
          traceId: traceId,
          table: 'segments',
          filters: [eq(segments.status, SpanStatus.Error)],
        }).then((r) => r[0])
        return this.compareTimestamps({ spans: spansts, segments: segmentsts })
      })(),
    ])

    return Result.ok({ children, completions, documents, errors })
  }

  async getRun({ segmentId, traceId }: { segmentId: string; traceId: string }) {
    const result = await this.db
      .execute(
        sql<Segment>`
        WITH RECURSIVE path AS (
          SELECT *, 0 AS level
          FROM ${segments}
          WHERE (
            ${segments.workspaceId} = ${this.workspaceId} AND
            ${segments.traceId} = ${traceId} AND
            ${segments.id} = ${segmentId}
          )
          UNION ALL
          SELECT parent.*, child.level + 1
          FROM ${segments} AS parent
          INNER JOIN path AS child
          ON parent.id = child.parent_id
          WHERE (
            child.parent_id IS NOT NULL AND
            child.level < 100
          )
        ) SEARCH BREADTH FIRST BY level SET rank
        SELECT *
        FROM path
        WHERE path.type = ${SegmentType.Document}
        ORDER BY level ASC
        LIMIT 1;`,
      )
      .then((r) => r.rows[0])

    if (!result) return Result.nil()
    return Result.ok<Segment<SegmentType.Document>>(result as Segment<SegmentType.Document>)
  }

  async listTracesByLog({ logUuid }: { logUuid: string }) {
    const result = await this.db
      .select({
        traceId: segments.traceId,
        startedAt: sql`max(${segments.startedAt})`.mapWith(parseJSON),
      })
      .from(segments)
      .where(and(this.scopeFilter, eq(segments.logUuid, logUuid)))
      .groupBy(segments.traceId)
      .orderBy(desc(sql`max(${segments.startedAt})`))
      .then((r) => r.map((r) => r.traceId))

    return Result.ok<string[]>(result)
  }
}

export class SegmentMetadatasRepository {
  protected workspaceId: number
  protected disk: DiskWrapper

  constructor(workspaceId: number, disk: DiskWrapper = diskFactory('private')) {
    this.workspaceId = workspaceId
    this.disk = disk
  }

  async get<T extends SegmentType = SegmentType>({
    segmentId,
    traceId,
    fresh,
  }: {
    segmentId: string
    traceId: string
    fresh?: boolean
  }) {
    const key = SEGMENT_METADATA_STORAGE_KEY(this.workspaceId, traceId, segmentId)
    const cache = await redis()

    try {
      let payload = fresh ? undefined : await cache.get(key)
      if (!payload) payload = await this.disk.get(key)

      const metadata = JSON.parse(payload)

      await cache.set(key, payload, 'EX', SEGMENT_METADATA_CACHE_TTL)

      return Result.ok<SegmentMetadata<T>>(metadata)
    } catch {
      return Result.nil()
    }
  }

  async invalidate({ segmentId, traceId }: { segmentId: string; traceId: string }) {
    const key = SEGMENT_METADATA_STORAGE_KEY(this.workspaceId, traceId, segmentId)
    const cache = await redis()

    try {
      await cache.del(key)
      return Result.nil()
    } catch {
      return Result.nil()
    }
  }
}
