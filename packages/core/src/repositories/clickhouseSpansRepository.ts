import { clickhouse } from '../client/clickhouse'
import {
    LogSources,
    Span,
    SpanType,
} from '../constants'
import { Result, TypedResult } from '../lib/Result'
import { ISpansRepository } from './interfaces/ISpansRepository'

export class ClickHouseSpansRepository implements ISpansRepository {
    constructor(private workspaceId: number) { }

    async get({ spanId, traceId }: { spanId: string; traceId: string }): Promise<TypedResult<Span | undefined>> {
        const query = `
      SELECT *
      FROM telemetry.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND trace_id = {traceId:String}
        AND span_id = {spanId:String}
      ORDER BY ingested_at DESC
      LIMIT 1
    `

        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: {
                    workspaceId: this.workspaceId,
                    traceId,
                    spanId,
                },
                format: 'JSONEachRow',
            })

            const rows = await resultSet.json<any>()
            if (rows.length === 0) return Result.nil()

            return Result.ok(this.mapRowToSpan(rows[0]))
        } catch (error) {
            console.error('ClickHouse get error:', error)
            return Result.nil()
        }
    }

    async list({ traceId }: { traceId: string }): Promise<TypedResult<Span[]>> {
        const query = `
      SELECT *
      FROM telemetry.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND trace_id = {traceId:String}
      ORDER BY started_at ASC, span_id ASC
    `

        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: {
                    workspaceId: this.workspaceId,
                    traceId,
                },
                format: 'JSONEachRow',
            })

            const rows = await resultSet.json<any>()
            return Result.ok(rows.map(this.mapRowToSpan))
        } catch (error) {
            console.error('ClickHouse list error:', error)
            return Result.ok([])
        }
    }

    async getLastTraceByLogUuid(logUuid: string): Promise<string | undefined> {
        const query = `
      SELECT trace_id
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND document_log_uuid = {logUuid:String}
      ORDER BY started_at DESC
      LIMIT 1
    `
        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: {
                    workspaceId: this.workspaceId,
                    logUuid,
                },
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            return rows[0]?.trace_id
        } catch (error) {
            console.error('ClickHouse getLastTraceByLogUuid error:', error)
            return undefined
        }
    }

    async listTraceIdsByLogUuid(logUuid: string): Promise<string[]> {
        const query = `
      SELECT DISTINCT trace_id
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND document_log_uuid = {logUuid:String}
      ORDER BY started_at DESC
    `
        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: {
                    workspaceId: this.workspaceId,
                    logUuid,
                },
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            return rows.map((r: any) => r.trace_id)
        } catch (error) {
            console.error('ClickHouse listTraceIdsByLogUuid error:', error)
            return []
        }
    }

    async approximateCount(params: {
        documentUuid: string
        commitUuid?: string
        type?: SpanType
        commitUuids?: string[]
        experimentUuids?: string[]
        createdAt?: { from?: Date; to?: Date }
    }): Promise<TypedResult<number | null>> {
        let query = `
      SELECT count() as count
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND document_uuid = {documentUuid:String}
    `
        const queryParams: Record<string, any> = {
            workspaceId: this.workspaceId,
            documentUuid: params.documentUuid,
        }

        if (params.commitUuid) {
            query += ` AND commit_uuid = {commitUuid:String}`
            queryParams.commitUuid = params.commitUuid
        }
        if (params.type) {
            query += ` AND type = {type:String}`
            queryParams.type = params.type
        }
        if (params.commitUuids && params.commitUuids.length > 0) {
            query += ` AND commit_uuid IN {commitUuids:Array(String)}`
            queryParams.commitUuids = params.commitUuids
        }
        if (params.experimentUuids && params.experimentUuids.length > 0) {
            query += ` AND experiment_uuid IN {experimentUuids:Array(String)}`
            queryParams.experimentUuids = params.experimentUuids
        }
        if (params.createdAt?.from) {
            query += ` AND started_at >= {from:DateTime64}`
            queryParams.from = params.createdAt.from.getTime()
        }
        if (params.createdAt?.to) {
            query += ` AND started_at <= {to:DateTime64}`
            queryParams.to = params.createdAt.to.getTime()
        }

        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: queryParams,
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            return Result.ok(Number(rows[0]?.count ?? 0))
        } catch (error) {
            console.error('ClickHouse approximateCount error:', error)
            return Result.ok(null)
        }
    }

    async approximateCountByProject(projectId: number): Promise<TypedResult<number | null>> {
        const query = `
      SELECT count() as count
      FROM latitude.spans
      WHERE project_id = {projectId:UInt64}
    `
        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: { projectId },
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            return Result.ok(Number(rows[0]?.count ?? 0))
        } catch (error) {
            console.error('ClickHouse approximateCountByProject error:', error)
            return Result.ok(null)
        }
    }

    async findByDocumentLogUuids(documentLogUuids: string[]): Promise<Span[]> {
        if (documentLogUuids.length === 0) return []

        const query = `
      SELECT *
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND document_log_uuid IN {uuids:Array(String)}
    `
        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: {
                    workspaceId: this.workspaceId,
                    uuids: documentLogUuids,
                },
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            return rows.map(this.mapRowToSpan.bind(this))
        } catch (error) {
            console.error('ClickHouse findByDocumentLogUuids error:', error)
            return []
        }
    }

    async findByDocumentLogUuid(documentLogUuid: string): Promise<Span | undefined> {
        const query = `
      SELECT *
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND document_log_uuid = {uuid:String}
      LIMIT 1
    `
        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: {
                    workspaceId: this.workspaceId,
                    uuid: documentLogUuid,
                },
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            if (rows.length === 0) return undefined
            return this.mapRowToSpan(rows[0])
        } catch (error) {
            console.error('ClickHouse findByDocumentLogUuid error:', error)
            return undefined
        }
    }

    async findByDocumentAndCommitLimited(params: {
        documentUuid: string
        type?: SpanType
        from?: { startedAt: string; id: string }
        limit?: number
        commitUuids?: string[]
        experimentUuids?: string[]
        createdAt?: { from?: Date; to?: Date }
    }): Promise<TypedResult<{
        items: Span[]
        next: { startedAt: string; id: string } | null
    }>> {
        let query = `
      SELECT *
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND document_uuid = {documentUuid:String}
    `
        const queryParams: Record<string, any> = {
            workspaceId: this.workspaceId,
            documentUuid: params.documentUuid,
            limit: (params.limit || 20) + 1,
        }

        if (params.type) {
            query += ` AND type = {type:String}`
            queryParams.type = params.type
        }
        if (params.commitUuids && params.commitUuids.length > 0) {
            query += ` AND commit_uuid IN {commitUuids:Array(String)}`
            queryParams.commitUuids = params.commitUuids
        }
        if (params.experimentUuids && params.experimentUuids.length > 0) {
            query += ` AND experiment_uuid IN {experimentUuids:Array(String)}`
            queryParams.experimentUuids = params.experimentUuids
        }
        if (params.createdAt?.from) {
            query += ` AND started_at >= {from:DateTime64}`
            queryParams.from = params.createdAt.from.getTime()
        }
        if (params.createdAt?.to) {
            query += ` AND started_at <= {to:DateTime64}`
            queryParams.to = params.createdAt.to.getTime()
        }

        if (params.from) {
            // Cursor pagination: (started_at, span_id) < (cursor_started_at, cursor_id)
            // Equivalent to: started_at < cursor_started_at OR (started_at = cursor_started_at AND span_id < cursor_id)
            query += ` AND (started_at < {cursorStartedAt:DateTime64} OR (started_at = {cursorStartedAt:DateTime64} AND span_id < {cursorId:String}))`
            queryParams.cursorStartedAt = new Date(params.from.startedAt).getTime()
            queryParams.cursorId = params.from.id
        }

        query += ` ORDER BY started_at DESC, span_id DESC LIMIT {limit:UInt32}`

        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: queryParams,
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            const items = rows.map(this.mapRowToSpan.bind(this))

            const limit = params.limit || 20
            const hasMore = items.length > limit
            const slicedItems = hasMore ? items.slice(0, limit) : items
            const next = hasMore
                ? {
                    startedAt: slicedItems[slicedItems.length - 1].startedAt.toISOString(),
                    id: slicedItems[slicedItems.length - 1].id,
                }
                : null

            return Result.ok({ items: slicedItems, next })
        } catch (error) {
            console.error('ClickHouse findByDocumentAndCommitLimited error:', error)
            return Result.ok({ items: [], next: null })
        }
    }

    async findByProjectLimited(params: {
        projectId: number
        type?: SpanType
        from?: { startedAt: string; id: string }
        source?: LogSources[]
        limit?: number
    }): Promise<TypedResult<{
        items: Span[]
        next: { startedAt: string; id: string } | null
    }>> {
        let query = `
      SELECT *
      FROM latitude.spans
      WHERE project_id = {projectId:UInt64}
    `
        const queryParams: Record<string, any> = {
            projectId: params.projectId,
            limit: (params.limit || 20) + 1,
        }

        if (params.type) {
            query += ` AND type = {type:String}`
            queryParams.type = params.type
        }
        if (params.source && params.source.length > 0) {
            // source is nullable, so we check if it's in the list OR if list contains null/undefined (though LogSources enum usually doesn't)
            query += ` AND source IN {source:Array(String)}`
            queryParams.source = params.source
        }

        if (params.from) {
            query += ` AND (started_at < {cursorStartedAt:DateTime64} OR (started_at = {cursorStartedAt:DateTime64} AND span_id < {cursorId:String}))`
            queryParams.cursorStartedAt = new Date(params.from.startedAt).getTime()
            queryParams.cursorId = params.from.id
        }

        query += ` ORDER BY started_at DESC, span_id DESC LIMIT {limit:UInt32}`

        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: queryParams,
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            const items = rows.map(this.mapRowToSpan.bind(this))

            const limit = params.limit || 20
            const hasMore = items.length > limit
            const slicedItems = hasMore ? items.slice(0, limit) : items
            const next = hasMore
                ? {
                    startedAt: slicedItems[slicedItems.length - 1].startedAt.toISOString(),
                    id: slicedItems[slicedItems.length - 1].id,
                }
                : null

            return Result.ok({ items: slicedItems, next })
        } catch (error) {
            console.error('ClickHouse findByProjectLimited error:', error)
            return Result.ok({ items: [], next: null })
        }
    }

    async findByParentAndType(params: {
        parentId: string
        type: SpanType
    }): Promise<Span[]> {
        const query = `
      SELECT *
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND parent_id = {parentId:String}
        AND type = {type:String}
    `
        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: {
                    workspaceId: this.workspaceId,
                    parentId: params.parentId,
                    type: params.type,
                },
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            return rows.map(this.mapRowToSpan.bind(this))
        } catch (error) {
            console.error('ClickHouse findByParentAndType error:', error)
            return []
        }
    }

    async findBySpanAndTraceIds(
        spanTraceIdPairs: Array<{ spanId: string; traceId: string }>,
    ): Promise<TypedResult<Span[]>> {
        if (spanTraceIdPairs.length === 0) return Result.ok([])

        // ClickHouse doesn't easily support (a,b) IN ((1,2), (3,4)) with parameters in a clean way
        // But we can use tuples if we format them correctly, or just build a big OR clause.
        // Given the list is likely small, OR clause is fine.
        // Actually, ClickHouse supports tuples in IN clause: WHERE (span_id, trace_id) IN (...)
        // But passing array of tuples as param might be tricky with the client.
        // Let's try to construct the tuple array for the parameter.

        // Constructing manual OR clause for safety
        const conditions = spanTraceIdPairs.map((_, i) => `(span_id = {spanId${i}:String} AND trace_id = {traceId${i}:String})`).join(' OR ')
        const query = `
      SELECT *
      FROM latitude.spans
      WHERE workspace_id = {workspaceId:UInt64}
        AND (${conditions})
    `

        const queryParams: Record<string, any> = {
            workspaceId: this.workspaceId,
        }
        spanTraceIdPairs.forEach((pair, i) => {
            queryParams[`spanId${i}`] = pair.spanId
            queryParams[`traceId${i}`] = pair.traceId
        })

        try {
            const resultSet = await clickhouse.query({
                query,
                query_params: queryParams,
                format: 'JSONEachRow',
            })
            const rows = await resultSet.json<any>()
            return Result.ok(rows.map(this.mapRowToSpan.bind(this)))
        } catch (error) {
            console.error('ClickHouse findBySpanAndTraceIds error:', error)
            return Result.ok([])
        }
    }

    private mapRowToSpan(row: any): Span {
        // Map ClickHouse row to Span object
        return {
            id: row.span_id,
            traceId: row.trace_id,
            workspaceId: row.workspace_id,
            apiKeyId: row.api_key_id,
            name: row.name,
            kind: row.kind,
            type: row.type,
            status: row.status,
            message: row.message,
            duration: row.duration_ms,
            startedAt: new Date(row.started_at),
            endedAt: new Date(row.ended_at),
            documentUuid: row.document_uuid,
            commitUuid: row.commit_uuid,
            experimentUuid: row.experiment_uuid,
            // ... map other fields
            parentId: row.parent_id,
            documentLogUuid: row.document_log_uuid,
            projectId: row.project_id,
            source: row.source || undefined,
            tokensPrompt: row.tokens_prompt,
            tokensCached: row.tokens_cached,
            tokensReasoning: row.tokens_reasoning,
            tokensCompletion: row.tokens_completion,
            model: row.model,
            cost: row.cost,
            createdAt: new Date(row.ingested_at),
            updatedAt: new Date(row.ingested_at),
        }
    }
}
