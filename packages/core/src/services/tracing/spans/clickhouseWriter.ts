import { clickhouse } from '../../../client/clickhouse'
import {
    CompletionSpanMetadata,
    SpanKind,
    SpanMetadata,
    SpanStatus,
    SpanType,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import { type ApiKey } from '../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'

export type ProcessedSpan = {
    id: string
    traceId: string
    parentId?: string
    name: string
    kind: SpanKind
    type: SpanType
    status: SpanStatus
    message?: string
    duration: number
    startedAt: Date
    endedAt: Date
    metadata: SpanMetadata
    documentLogUuid?: string
    projectId?: number
}

export async function writeSpansToClickHouse(
    spans: ProcessedSpan[],
    workspace: Workspace,
    apiKey: ApiKey,
) {
    const rows = spans.map((span) => {
        let metadata
        if (span.type === SpanType.Completion) {
            metadata = span.metadata as CompletionSpanMetadata
        }

        return {
            workspace_id: workspace.id,
            trace_id: span.traceId,
            span_id: span.id,
            parent_id: span.parentId || null,
            api_key_id: apiKey.id,
            name: span.name,
            kind: span.kind,
            type: span.type,
            status: span.status,
            message: span.message || '',
            duration_ms: span.duration,
            started_at: span.startedAt.getTime(), // ClickHouse DateTime64 expects ms or string
            ended_at: span.endedAt.getTime(),
            document_log_uuid:
                'documentLogUuid' in span.metadata
                    ? (span.metadata.documentLogUuid as string)
                    : null,
            document_uuid:
                'promptUuid' in span.metadata
                    ? (span.metadata.promptUuid as string)
                    : null,
            commit_uuid:
                'versionUuid' in span.metadata
                    ? (span.metadata.versionUuid as string)
                    : null,
            experiment_uuid:
                'experimentUuid' in span.metadata
                    ? (span.metadata.experimentUuid as string)
                    : null,
            project_id: span.projectId || null,

            // Denormalized analytics
            provider: metadata?.provider || '',
            model: metadata?.model || '',
            cost: metadata?.cost || 0,
            tokens_prompt: metadata?.tokens?.prompt || 0,
            tokens_cached: metadata?.tokens?.cached || 0,
            tokens_reasoning: metadata?.tokens?.reasoning || 0,
            tokens_completion: metadata?.tokens?.completion || 0,
        }
    })

    try {
        await clickhouse.insert({
            table: 'latitude.spans',
            values: rows,
            format: 'JSONEachRow',
        })
        return Result.ok(undefined)
    } catch (error) {
        console.error('Error writing spans to ClickHouse:', error)
        // We don't want to fail the request if ClickHouse write fails
        // In a real production system, we might want to queue these for retry
        return Result.ok(undefined)
    }
}
