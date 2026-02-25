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
  MAIN_SPAN_TYPES,
  Span,
  SPAN_METADATA_CACHE_TTL,
  SPAN_METADATA_STORAGE_KEY,
  SpanMetadata,
  SpanType,
} from '../constants'
import { diskFactory, DiskWrapper } from '../lib/disk'
import { decompressToString } from '../lib/disk/compression'
import { Result } from '../lib/Result'
import {
  applyDefaultSpansCreatedAtRange,
  normalizeCreatedAtRange,
  shouldFallbackToAllTime,
} from '../services/spans/defaultCreatedAtWindow'
import { spans } from '../schema/models/spans'
import Repository from './repositoryV2'
import { EvaluationResultV2 } from '@latitude-data/constants'
import { findSpan as chFindSpan } from '../queries/clickhouse/spans/get'
import { findSpans as chFindSpans } from '../queries/clickhouse/spans/list'
import {
  findByDocumentAndCommitLimited as chFindByDocumentAndCommitLimited,
  findByProjectLimited as chFindByProjectLimited,
} from '../queries/clickhouse/spans/findLimited'
import {
  getLastTraceByLogUuid as chGetLastTraceByLogUuid,
  listTraceIdsByLogUuid as chListTraceIdsByLogUuid,
  findByDocumentLogUuids as chFindByDocumentLogUuids,
  findByDocumentLogUuid as chFindByDocumentLogUuid,
  listByDocumentLogUuid as chListByDocumentLogUuid,
  findLastMainSpanByDocumentLogUuid as chFindLastMainSpanByDocumentLogUuid,
  findFirstMainSpanByDocumentLogUuid as chFindFirstMainSpanByDocumentLogUuid,
  getSpanIdentifiersByDocumentLogUuids as chGetSpanIdentifiersByDocumentLogUuids,
} from '../queries/clickhouse/spans/findByDocumentLogUuid'
import { getByDocumentLogUuidAndSpanId as chGetByDocumentLogUuidAndSpanId } from '../queries/clickhouse/spans/getByDocumentLogUuidAndSpanId'
import {
  findBySpanAndTraceIdPairs as chFindBySpanAndTraceIdPairs,
  findByParentAndType as chFindByParentAndType,
  findCompletionsByParentIds as chFindCompletionsByParentIds,
} from '../queries/clickhouse/spans/findBySpanAndTraceIds'
import { countByProjectAndSource as chCountByProjectAndSource } from '../queries/clickhouse/spans/countByProjectAndSource'
import { Database, database } from '../client'
import { isClickHouseSpansReadEnabled } from '../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import { captureException } from '../utils/datadogCapture'

const tt = getTableColumns(spans)

export class SpansRepository extends Repository<Span> {
  private clickHouseOverride: boolean | undefined

  constructor(
    workspaceId: number,
    db: Database = database,
    options?: { useClickHouse?: boolean },
  ) {
    super(workspaceId, db)
    this.clickHouseOverride = options?.useClickHouse
  }

  private async shouldUseClickHouse(): Promise<boolean> {
    if (this.clickHouseOverride !== undefined) return this.clickHouseOverride

    try {
      this.clickHouseOverride = await isClickHouseSpansReadEnabled(
        this.workspaceId,
        this.db,
      )
    } catch (error) {
      captureException(error as Error)
      this.clickHouseOverride = false
    }

    return this.clickHouseOverride
  }

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

  private buildFilterConditions({
    types,
    source,
    experimentUuids,
    createdAt,
  }: {
    types?: SpanType[]
    source?: LogSources[]
    experimentUuids?: string[]
    createdAt?: { from?: Date; to?: Date }
  }): SQL<unknown>[] {
    const conditions = [
      this.scopeFilter,
      types ? inArray(spans.type, types) : undefined,
      source
        ? or(inArray(spans.source, source), isNull(spans.source))
        : undefined,
    ].filter(Boolean) as SQL<unknown>[]

    // Add date range filter if provided
    if (createdAt?.from && createdAt?.to) {
      conditions.push(between(spans.startedAt, createdAt.from, createdAt.to))
    } else if (createdAt?.from) {
      conditions.push(gte(spans.startedAt, createdAt.from))
    } else if (createdAt?.to) {
      conditions.push(lte(spans.startedAt, createdAt.to))
    }

    // Add experiment filter if provided - filter by experiment UUIDs directly
    if (experimentUuids && experimentUuids.length > 0) {
      conditions.push(inArray(spans.experimentUuid, experimentUuids))
    }

    return conditions
  }

  private buildCursorCondition(from?: { startedAt: string; id: string }) {
    if (!from) return undefined
    return sql`(${spans.startedAt}, ${spans.id}) < (${from.startedAt}, ${from.id})`
  }

  private async executeLimitedQuery({
    conditions,
    from,
    limit,
  }: {
    conditions: SQL<unknown>[]
    from?: { startedAt: string; id: string }
    limit: number
  }) {
    const cursorCondition = this.buildCursorCondition(from)
    const whereConditions = [...conditions, cursorCondition].filter(
      Boolean,
    ) as SQL<unknown>[]

    const result = await this.db
      .select(tt)
      .from(spans)
      .where(and(...whereConditions))
      .orderBy(desc(spans.startedAt), desc(spans.id))
      .limit(limit + 1)

    const hasMore = result.length > limit
    const items = hasMore ? result.slice(0, limit) : result
    const next = hasMore
      ? {
          startedAt: items[items.length - 1]!.startedAt.toISOString(),
          id: items[items.length - 1]!.id,
        }
      : null

    return { items: items as Span[], next }
  }

  private async executeWithDefaultCreatedAtAndFallback({
    createdAt,
    from,
    limit,
    buildConditions,
  }: {
    createdAt?: { from?: Date; to?: Date }
    from?: { startedAt: string; id: string }
    limit: number
    buildConditions: (createdAt?: { from?: Date; to?: Date }) => SQL<unknown>[]
  }) {
    const normalizedCreatedAt = normalizeCreatedAtRange(createdAt)
    const defaultCreatedAt = applyDefaultSpansCreatedAtRange({
      createdAt: normalizedCreatedAt,
      hasCursor: Boolean(from),
    })

    const firstPage = await this.executeLimitedQuery({
      conditions: buildConditions(defaultCreatedAt),
      from,
      limit,
    })

    if (
      !shouldFallbackToAllTime({
        hasCursor: Boolean(from),
        normalizedCreatedAt,
        itemCount: firstPage.items.length,
      })
    ) {
      return { ...firstPage, didFallbackToAllTime: undefined }
    }

    const allTime = await this.executeLimitedQuery({
      conditions: buildConditions(undefined),
      from: undefined,
      limit,
    })

    return { ...allTime, didFallbackToAllTime: true }
  }

  async get({ spanId, traceId }: { spanId: string; traceId: string }) {
    if (await this.shouldUseClickHouse()) {
      return chFindSpan({ workspaceId: this.workspaceId, spanId, traceId })
    }

    const result = await this.scope
      .where(
        and(this.scopeFilter, eq(spans.traceId, traceId), eq(spans.id, spanId)),
      )
      .limit(1)
      .then((r) => r[0])

    if (!result) return Result.nil()
    return Result.ok<Span>(result as Span)
  }

  async getByDocumentLogUuidAndSpanId({
    documentLogUuid,
    spanId,
  }: {
    documentLogUuid: string
    spanId: string
  }) {
    if (await this.shouldUseClickHouse()) {
      return chGetByDocumentLogUuidAndSpanId({
        workspaceId: this.workspaceId,
        documentLogUuid,
        spanId,
      })
    }

    const traceIds = await this.listTraceIdsByLogUuid(documentLogUuid)
    if (traceIds.length === 0) return Result.nil()

    const result = await this.scope
      .where(
        and(
          this.scopeFilter,
          inArray(spans.traceId, traceIds),
          eq(spans.id, spanId),
        ),
      )
      .limit(1)
      .then((r) => r[0])

    if (!result) return Result.nil()
    return Result.ok<Span>(result as Span)
  }

  async list({ traceId }: { traceId: string }) {
    if (await this.shouldUseClickHouse()) {
      return chFindSpans({ workspaceId: this.workspaceId, traceId })
    }

    const result = await this.db
      .select(tt)
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.traceId, traceId)))
      .orderBy(asc(spans.startedAt), asc(spans.id))

    return Result.ok<Span[]>(result as Span[])
  }

  async getLastTraceByLogUuid(
    logUuid: string,
    pkFilters?: {
      projectId?: number
      commitUuid?: string
      documentUuid?: string
    },
  ) {
    if (await this.shouldUseClickHouse()) {
      return chGetLastTraceByLogUuid({
        workspaceId: this.workspaceId,
        logUuid,
        ...pkFilters,
      })
    }

    return await this.db
      .select({ traceId: spans.traceId })
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.documentLogUuid, logUuid)))
      .orderBy(desc(spans.startedAt))
      .limit(1)
      .then((r) => r[0]?.traceId)
  }

  async listTraceIdsByLogUuid(
    logUuid: string,
    pkFilters?: {
      projectId?: number
      commitUuid?: string
      documentUuid?: string
    },
  ) {
    if (await this.shouldUseClickHouse()) {
      return chListTraceIdsByLogUuid({
        workspaceId: this.workspaceId,
        logUuid,
        ...pkFilters,
      })
    }

    return await this.db
      .selectDistinctOn([spans.traceId], { traceId: spans.traceId })
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.documentLogUuid, logUuid)))
      .orderBy(spans.traceId, desc(spans.startedAt))
      .then((r) => r.map((r) => r.traceId))
  }

  async findByDocumentLogUuids(documentLogUuids: string[]) {
    if (await this.shouldUseClickHouse()) {
      return chFindByDocumentLogUuids({
        workspaceId: this.workspaceId,
        documentLogUuids,
      })
    }

    return this.db
      .select()
      .from(spans)
      .where(inArray(spans.documentLogUuid, documentLogUuids))
      .then((r) => r as Span[])
  }

  async getSpanIdentifiersByDocumentLogUuids(documentLogUuids: string[]) {
    if (await this.shouldUseClickHouse()) {
      return chGetSpanIdentifiersByDocumentLogUuids({
        workspaceId: this.workspaceId,
        documentLogUuids,
      })
    }

    if (documentLogUuids.length === 0) return []

    return this.db
      .select({ traceId: spans.traceId, spanId: spans.id })
      .from(spans)
      .where(
        and(this.scopeFilter, inArray(spans.documentLogUuid, documentLogUuids)),
      )
      .then((r) =>
        r.map((row) => ({ traceId: row.traceId, spanId: row.spanId })),
      )
  }

  async findByDocumentLogUuid(
    documentLogUuid: string,
    pkFilters?: {
      projectId?: number
      commitUuid?: string
      documentUuid?: string
    },
  ) {
    if (await this.shouldUseClickHouse()) {
      return chFindByDocumentLogUuid({
        workspaceId: this.workspaceId,
        documentLogUuid,
        ...pkFilters,
      })
    }

    const result = await this.db
      .select()
      .from(spans)
      .where(eq(spans.documentLogUuid, documentLogUuid))
      .then((r) => r[0])

    return result as Span | undefined
  }

  async listByDocumentLogUuid(
    documentLogUuid: string,
    pkFilters?: {
      projectId?: number
      commitUuid?: string
      documentUuid?: string
    },
  ) {
    if (await this.shouldUseClickHouse()) {
      return chListByDocumentLogUuid({
        workspaceId: this.workspaceId,
        documentLogUuid,
        ...pkFilters,
      })
    }

    return this.db
      .select()
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.documentLogUuid, documentLogUuid)))
      .orderBy(asc(spans.startedAt), asc(spans.id))
      .then((r) => r as Span[])
  }

  async findLastMainSpanByDocumentLogUuid(
    documentLogUuid: string,
    pkFilters?: {
      projectId?: number
      commitUuid?: string
      documentUuid?: string
    },
  ) {
    if (await this.shouldUseClickHouse()) {
      return chFindLastMainSpanByDocumentLogUuid({
        workspaceId: this.workspaceId,
        documentLogUuid,
        ...pkFilters,
      })
    }

    const result = await this.db
      .select()
      .from(spans)
      .where(
        and(
          this.scopeFilter,
          eq(spans.documentLogUuid, documentLogUuid),
          or(
            eq(spans.type, SpanType.Prompt),
            eq(spans.type, SpanType.Chat),
            eq(spans.type, SpanType.External),
          ),
        ),
      )
      .orderBy(desc(spans.startedAt))
      .limit(1)
      .then((r) => r[0])

    return result as Span | undefined
  }

  async findFirstMainSpanByDocumentLogUuid(
    documentLogUuid: string,
    pkFilters?: {
      projectId?: number
      commitUuid?: string
      documentUuid?: string
    },
  ) {
    if (await this.shouldUseClickHouse()) {
      return chFindFirstMainSpanByDocumentLogUuid({
        workspaceId: this.workspaceId,
        documentLogUuid,
        ...pkFilters,
      })
    }

    const result = await this.db
      .select()
      .from(spans)
      .where(
        and(
          this.scopeFilter,
          eq(spans.documentLogUuid, documentLogUuid),
          or(
            eq(spans.type, SpanType.Prompt),
            eq(spans.type, SpanType.Chat),
            eq(spans.type, SpanType.External),
          ),
        ),
      )
      .orderBy(asc(spans.startedAt))
      .limit(1)
      .then((r) => r[0])

    return result as Span | undefined
  }

  async isFirstMainSpanInConversation(
    documentLogUuid: string,
    spanId: string,
    traceId: string,
    pkFilters?: {
      projectId?: number
      commitUuid?: string
      documentUuid?: string
    },
  ): Promise<boolean> {
    const firstSpan = await this.findFirstMainSpanByDocumentLogUuid(
      documentLogUuid,
      pkFilters,
    )
    return firstSpan?.id === spanId && firstSpan?.traceId === traceId
  }

  async findByDocumentAndCommitLimited({
    projectId,
    documentUuid,
    types,
    from,
    limit = DEFAULT_PAGINATION_SIZE,
    commitUuids,
    experimentUuids,
    source,
    testDeploymentIds,
    createdAt,
  }: {
    projectId: number
    documentUuid: string
    types?: SpanType[]
    from?: { startedAt: string; id: string }
    limit?: number
    commitUuids?: string[]
    experimentUuids?: string[]
    source?: LogSources[]
    testDeploymentIds?: number[]
    createdAt?: { from?: Date; to?: Date }
  }) {
    if (await this.shouldUseClickHouse()) {
      const result = await chFindByDocumentAndCommitLimited({
        workspaceId: this.workspaceId,
        projectId,
        documentUuid,
        types,
        from,
        limit,
        commitUuids,
        experimentUuids,
        source,
        testDeploymentIds,
        createdAt,
      })
      return Result.ok(result)
    }

    const result = await this.executeWithDefaultCreatedAtAndFallback({
      createdAt,
      from,
      limit,
      buildConditions: (queryCreatedAt) => {
        const conditions = [
          ...this.buildFilterConditions({
            types,
            source,
            experimentUuids,
            createdAt: queryCreatedAt,
          }),
          eq(spans.documentUuid, documentUuid),
        ]

        if (commitUuids && commitUuids.length > 0) {
          conditions.push(inArray(spans.commitUuid, commitUuids))
        }

        if (testDeploymentIds && testDeploymentIds.length > 0) {
          conditions.push(inArray(spans.testDeploymentId, testDeploymentIds))
        }

        return conditions
      },
    })

    return Result.ok(result)
  }

  async findByProjectLimited({
    projectId,
    types,
    from,
    source,
    limit = DEFAULT_PAGINATION_SIZE,
    experimentUuids,
    createdAt,
  }: {
    projectId: number
    types?: SpanType[]
    from?: { startedAt: string; id: string }
    source?: LogSources[]
    limit?: number
    experimentUuids?: string[]
    createdAt?: { from?: Date; to?: Date }
  }) {
    if (await this.shouldUseClickHouse()) {
      const result = await chFindByProjectLimited({
        workspaceId: this.workspaceId,
        projectId,
        types,
        from,
        source,
        limit,
        experimentUuids,
        createdAt,
      })
      return Result.ok(result)
    }

    const result = await this.executeWithDefaultCreatedAtAndFallback({
      createdAt,
      from,
      limit,
      buildConditions: (queryCreatedAt) => [
        ...this.buildFilterConditions({
          types,
          source,
          experimentUuids,
          createdAt: queryCreatedAt,
        }),
        eq(spans.projectId, projectId),
      ],
    })

    return Result.ok(result)
  }

  async findByParentAndType({
    parentId,
    type,
  }: {
    parentId: string
    type: SpanType
  }) {
    if (await this.shouldUseClickHouse()) {
      return chFindByParentAndType({
        workspaceId: this.workspaceId,
        parentId,
        type,
      })
    }

    return await this.db
      .select()
      .from(spans)
      .where(and(eq(spans.parentId, parentId), eq(spans.type, type)))
  }

  async findBySpanAndTraceIds(
    spanTraceIdPairs: Array<{ spanId: string; traceId: string }>,
  ) {
    if (await this.shouldUseClickHouse()) {
      return Result.ok<Span[]>(
        await chFindBySpanAndTraceIdPairs({
          workspaceId: this.workspaceId,
          pairs: spanTraceIdPairs,
        }),
      )
    }

    if (spanTraceIdPairs.length === 0) {
      return Result.ok<Span[]>([])
    }

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

  async countByProjectAndSource({
    projectId,
    source,
  }: {
    projectId: number
    source?: LogSources[]
  }) {
    if (await this.shouldUseClickHouse()) {
      const result = await chCountByProjectAndSource({
        workspaceId: this.workspaceId,
        projectId,
        source,
      })
      return Result.ok<Record<LogSources, number>>(result)
    }

    const sourcesToCount = source ?? Object.values(LogSources)
    const countsBySource: Record<LogSources, number> = {} as Record<
      LogSources,
      number
    >

    for (const source of sourcesToCount) {
      const whereClause = and(
        this.scopeFilter,
        eq(spans.projectId, projectId),
        eq(spans.source, source),
      )

      try {
        const result = await this.db
          .select({ count: count() })
          .from(spans)
          .where(whereClause)
          .then((r) => r[0])

        countsBySource[source] = result?.count ?? 0
      } catch (_) {
        countsBySource[source] = 0
      }
    }

    return Result.ok<Record<LogSources, number>>(countsBySource)
  }

  async findByEvaluationResults(
    evaluationResults: Pick<
      EvaluationResultV2,
      'evaluatedSpanId' | 'evaluatedTraceId'
    >[],
  ) {
    if (evaluationResults.length === 0) return []

    const spanTraceIdPairs = evaluationResults.map(
      (result) => sql`(${result.evaluatedSpanId}, ${result.evaluatedTraceId})`,
    )

    const fetchedSpans = await this.db
      .select()
      .from(spans)
      .where(
        and(
          this.scopeFilter,
          sql`(${spans.id}, ${spans.traceId}) IN (${sql.join(spanTraceIdPairs, sql`, `)})`,
          inArray(spans.type, Array.from(MAIN_SPAN_TYPES)),
        ),
      )

    return this.orderSpansByEvaluationResults(
      evaluationResults,
      fetchedSpans as Span[],
    )
  }

  private orderSpansByEvaluationResults(
    evaluationResults: Pick<
      EvaluationResultV2,
      'evaluatedSpanId' | 'evaluatedTraceId'
    >[],
    spansList: Span[],
  ) {
    const spanMap = new Map<string, Span>()
    for (const span of spansList) {
      spanMap.set(this.buildSpanKey(span.id, span.traceId), span)
    }

    return evaluationResults
      .map(({ evaluatedSpanId, evaluatedTraceId }) =>
        spanMap.get(this.buildSpanKey(evaluatedSpanId!, evaluatedTraceId!)),
      )
      .filter((span): span is Span => span !== undefined)
  }

  private buildSpanKey(spanId: string, traceId: string) {
    return `${spanId}:${traceId}`
  }

  async findCompletionsByParentIds(
    parentIds: Array<{ traceId: string; spanId: string }>,
  ) {
    if (await this.shouldUseClickHouse()) {
      const result = await chFindCompletionsByParentIds({
        workspaceId: this.workspaceId,
        parentIds,
      })
      return Result.ok(result)
    }

    if (parentIds.length === 0) {
      return Result.ok<Map<string, Span<SpanType.Completion>>>(new Map())
    }

    const conditions = parentIds.map(({ spanId }) => eq(spans.parentId, spanId))

    const result = await this.db
      .select(tt)
      .from(spans)
      .where(
        and(
          this.scopeFilter,
          eq(spans.type, SpanType.Completion),
          or(...conditions),
        ),
      )

    const completionsByParent = new Map<string, Span<SpanType.Completion>>()
    for (const completion of result) {
      if (completion.parentId) {
        const parentKey = `${completion.traceId}:${completion.parentId}`
        if (!completionsByParent.has(parentKey)) {
          completionsByParent.set(
            parentKey,
            completion as Span<SpanType.Completion>,
          )
        }
      }
    }

    return Result.ok(completionsByParent)
  }
}

export class SpanMetadatasRepository {
  protected workspaceId: number
  protected disk: DiskWrapper

  constructor(workspaceId: number, disk: DiskWrapper = diskFactory('private')) {
    this.workspaceId = workspaceId
    this.disk = disk
  }

  static buildKey(span: { traceId: string; id: string }) {
    return `${span.traceId}:${span.id}`
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
      if (!payload) {
        const raw = await this.disk.getBuffer(key)
        payload = await decompressToString(raw)
      }

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

  /**
   * Batch fetch metadata for multiple spans in parallel.
   * Returns a Map keyed by span key (traceId:spanId).
   */
  async getBatch<T extends SpanType = SpanType>(
    spanIdentifiers: Array<{ traceId: string; spanId: string }>,
  ) {
    if (spanIdentifiers.length === 0) {
      return new Map<string, SpanMetadata<T>>()
    }

    const results = await Promise.all(
      spanIdentifiers.map(async ({ traceId, spanId }) => {
        const result = await this.get<T>({ traceId, spanId })
        return {
          key: SpanMetadatasRepository.buildKey({ traceId, id: spanId }),
          metadata: result.ok ? result.value : undefined,
        }
      }),
    )

    const metadataMap = new Map<string, SpanMetadata<T>>()
    for (const { key, metadata } of results) {
      if (metadata) {
        metadataMap.set(key, metadata)
      }
    }

    return metadataMap
  }
}
