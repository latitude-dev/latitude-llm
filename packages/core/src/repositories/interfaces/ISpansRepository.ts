import {
    LogSources,
    Span,
    SpanType,
} from '../../constants'
import { TypedResult } from '../../lib/Result'

export interface ISpansRepository {
    get(params: { spanId: string; traceId: string }): Promise<TypedResult<Span | undefined>>

    list(params: { traceId: string }): Promise<TypedResult<Span[]>>

    getLastTraceByLogUuid(logUuid: string): Promise<string | undefined>

    listTraceIdsByLogUuid(logUuid: string): Promise<string[]>

    approximateCount(params: {
        documentUuid: string
        commitUuid?: string
        type?: SpanType
        commitUuids?: string[]
        experimentUuids?: string[]
        createdAt?: { from?: Date; to?: Date }
    }): Promise<TypedResult<number | null>>

    approximateCountByProject(projectId: number): Promise<TypedResult<number | null>>

    findByDocumentLogUuids(documentLogUuids: string[]): Promise<Span[]>

    findByDocumentLogUuid(documentLogUuid: string): Promise<Span | undefined>

    findByDocumentAndCommitLimited(params: {
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
    }>>

    findByProjectLimited(params: {
        projectId: number
        type?: SpanType
        from?: { startedAt: string; id: string }
        source?: LogSources[]
        limit?: number
    }): Promise<TypedResult<{
        items: Span[]
        next: { startedAt: string; id: string } | null
    }>>

    findByParentAndType(params: {
        parentId: string
        type: SpanType
    }): Promise<Span[]>

    findBySpanAndTraceIds(
        spanTraceIdPairs: Array<{ spanId: string; traceId: string }>,
    ): Promise<TypedResult<Span[]>>
}
