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
import { EvaluationResultV2 } from '@latitude-data/constants'

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

  async getByDocumentLogUuidAndSpanId({
    documentLogUuid,
    spanId,
  }: {
    documentLogUuid: string
    spanId: string
  }) {
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
    const result = await this.db
      .select(tt)
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.traceId, traceId)))
      .orderBy(asc(spans.startedAt), asc(spans.id))

    return Result.ok<Span[]>(result as Span[])
  }

  async getLastTraceByLogUuid(logUuid: string) {
    return await this.db
      .select({ traceId: spans.traceId })
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.documentLogUuid, logUuid)))
      .orderBy(desc(spans.startedAt))
      .limit(1)
      .then((r) => r[0]?.traceId)
  }

  async listTraceIdsByLogUuid(logUuid: string) {
    return await this.db
      .selectDistinctOn([spans.traceId], { traceId: spans.traceId })
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.documentLogUuid, logUuid)))
      .orderBy(spans.traceId, desc(spans.startedAt))
      .then((r) => r.map((r) => r.traceId))
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

  async listByDocumentLogUuid(documentLogUuid: string) {
    return this.db
      .select()
      .from(spans)
      .where(and(this.scopeFilter, eq(spans.documentLogUuid, documentLogUuid)))
      .orderBy(asc(spans.startedAt), asc(spans.id))
      .then((r) => r as Span[])
  }

  async findLastMainSpanByDocumentLogUuid(documentLogUuid: string) {
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

  async findByDocumentAndCommitLimited({
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
    const conditions = [
      ...this.buildFilterConditions({
        types,
        source,
        experimentUuids,
        createdAt,
      }),
      eq(spans.documentUuid, documentUuid),
    ]

    // Add commit filter if provided - filter by commit UUIDs directly
    if (commitUuids && commitUuids.length > 0) {
      conditions.push(inArray(spans.commitUuid, commitUuids))
    }

    // Add experiment filter if provided - filter by experiment UUIDs directly
    if (experimentUuids && experimentUuids.length > 0) {
      conditions.push(inArray(spans.experimentUuid, experimentUuids))
    }

    // Add test deployment filter if provided - filter by test deployment IDs directly
    if (testDeploymentIds && testDeploymentIds.length > 0) {
      conditions.push(inArray(spans.testDeploymentId, testDeploymentIds))
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
    // Fetch commit UUIDs - this should be fast with proper commit indexes
    // FIXME: This is wrong use CommitRepository.getCommitsHistory
    const commitUuids = await this.db
      .select({ uuid: commits.uuid })
      .from(commits)
      .where(eq(commits.projectId, projectId))
      .then((r) => r.map((c) => c.uuid))

    if (commitUuids.length === 0) return Result.ok({ items: [], next: null })

    const conditions = [
      ...this.buildFilterConditions({
        types,
        source,
        experimentUuids,
        createdAt,
      }),
      from
        ? sql`(${spans.startedAt}, ${spans.id}) < (${from.startedAt}, ${from.id})`
        : undefined,
    ].filter(Boolean) as SQL<unknown>[]

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

  async countByProjectAndSource({
    projectId,
    source,
  }: {
    projectId: number
    source?: LogSources[]
  }) {
    // Determine which sources to count
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
          eq(spans.type, SpanType.Prompt),
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
