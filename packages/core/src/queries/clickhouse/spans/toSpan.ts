import {
  LogSources,
  Span,
  SpanKind,
  SpanStatus,
  SpanType,
} from '@latitude-data/constants'
import { SpanRow } from '../../../schema/models/clickhouse/spans'
import { orUndefined, parseClickHouseDate } from '../../../lib/typeConversions'

export function mapRow(row: SpanRow): Span & { spanId: string } {
  const startedAt = parseClickHouseDate(row.started_at)
  const endedAt = parseClickHouseDate(row.ended_at)
  const ingestedAt = parseClickHouseDate(row.ingested_at)

  return {
    id: row.span_id,
    spanId: row.span_id,
    traceId: row.trace_id,
    parentId: orUndefined(row.parent_id),
    workspaceId: Number(row.workspace_id),
    projectId: row.project_id ? Number(row.project_id) : 0,
    apiKeyId: Number(row.api_key_id),
    name: row.name,
    kind: row.kind as SpanKind,
    type: row.type as SpanType,
    status: row.status as SpanStatus,
    message: orUndefined(row.message),
    duration: row.duration_ms,
    startedAt,
    endedAt,
    createdAt: ingestedAt,
    updatedAt: ingestedAt,
    documentLogUuid: orUndefined(row.document_log_uuid),
    documentUuid: orUndefined(row.document_uuid),
    commitUuid: orUndefined(row.commit_uuid),
    experimentUuid: orUndefined(row.experiment_uuid),
    testDeploymentId: row.test_deployment_id
      ? Number(row.test_deployment_id)
      : undefined,
    previousTraceId: orUndefined(row.previous_trace_id),
    source: orUndefined(row.source) as LogSources | undefined,
    tokensPrompt: row.tokens_prompt ? Number(row.tokens_prompt) : undefined,
    tokensCached: row.tokens_cached ? Number(row.tokens_cached) : undefined,
    tokensReasoning: row.tokens_reasoning
      ? Number(row.tokens_reasoning)
      : undefined,
    tokensCompletion: row.tokens_completion
      ? Number(row.tokens_completion)
      : undefined,
    model: orUndefined(row.model),
    cost: row.cost ? Number(row.cost) : undefined,
  }
}
