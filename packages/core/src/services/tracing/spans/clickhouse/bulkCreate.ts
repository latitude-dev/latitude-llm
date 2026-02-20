import {
  CompletionSpanMetadata,
  SpanMetadata,
  SpanType,
} from '../../../../constants'
import { insertRows, toClickHouseDateTime } from '../../../../clickhouse/insert'
import { TypedResult } from '../../../../lib/Result'
import {
  SpanInput,
  SpanRow,
  TABLE_NAME,
} from '../../../../schema/models/clickhouse/spans'

type LocalSpanInput = {
  id: string
  traceId: string
  parentId?: string
  workspaceId: number
  apiKeyId: number
  name: string
  kind: string
  type: string
  status: string
  message?: string
  duration: number
  startedAt: Date
  endedAt: Date
  metadata: SpanMetadata
  retentionExpiresAt: Date
}

function extractCompletionFields(metadata: SpanMetadata) {
  const m = metadata as CompletionSpanMetadata
  return {
    provider: m.provider ?? '',
    model: m.model ?? null,
    cost: m.cost ?? null,
    tokens_prompt: m.tokens?.prompt ?? null,
    tokens_cached: m.tokens?.cached ?? null,
    tokens_reasoning: m.tokens?.reasoning ?? null,
    tokens_completion: m.tokens?.completion ?? null,
  }
}

function metadataField<T>(metadata: SpanMetadata, key: string): T | null {
  if (!(key in metadata)) return null
  return ((metadata as Record<string, unknown>)[key] as T) ?? null
}

function toRow(span: LocalSpanInput): SpanInput {
  const isCompletion = span.type === SpanType.Completion
  const completion = isCompletion
    ? extractCompletionFields(span.metadata)
    : {
        provider: '',
        model: null,
        cost: null,
        tokens_prompt: null,
        tokens_cached: null,
        tokens_reasoning: null,
        tokens_completion: null,
      }

  return {
    workspace_id: span.workspaceId,
    trace_id: span.traceId,
    span_id: span.id,
    parent_id: span.parentId ?? null,
    previous_trace_id: metadataField<string>(span.metadata, 'previousTraceId'),
    api_key_id: span.apiKeyId,
    document_log_uuid: metadataField<string>(span.metadata, 'documentLogUuid'),
    document_uuid: metadataField<string>(span.metadata, 'promptUuid'),
    commit_uuid: metadataField<string>(span.metadata, 'versionUuid'),
    experiment_uuid: metadataField<string>(span.metadata, 'experimentUuid'),
    project_id: metadataField<number>(span.metadata, 'projectId'),
    test_deployment_id: metadataField<number>(
      span.metadata,
      'testDeploymentId',
    ),
    name: span.name,
    kind: span.kind,
    type: span.type,
    status: span.status,
    message: span.message ?? null,
    duration_ms: span.duration,
    started_at: toClickHouseDateTime(span.startedAt),
    ended_at: toClickHouseDateTime(span.endedAt),
    source: metadataField<string>(span.metadata, 'source'),
    ...completion,
    ingested_at: toClickHouseDateTime(new Date()),
    retention_expires_at: toClickHouseDateTime(span.retentionExpiresAt),
  }
}

export function bulkCreate(
  spans: LocalSpanInput[],
): Promise<TypedResult<undefined>> {
  const rows = spans.map(toRow)
  return insertRows(TABLE_NAME, rows as SpanRow[])
}
