import {
  LogSources,
  Span,
  SpanKind,
  SpanStatus,
  SpanType,
} from '@latitude-data/constants'
import { SpanRow } from '../../../clickhouse/models/spans'
import {
  orUndefined,
  parseClickHouseDate,
} from '../../../lib/typeConversions'

export function spanRowToSpan(row: SpanRow): Span {
  const startedAt = parseClickHouseDate(row.started_at)
  const endedAt = parseClickHouseDate(row.ended_at)
  const ingestedAt = parseClickHouseDate(row.ingested_at)

  return {
    id: row.span_id,
    traceId: row.trace_id,
    parentId: orUndefined(row.parent_id),
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? 0,
    apiKeyId: row.api_key_id,
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
    testDeploymentId: orUndefined(row.test_deployment_id),
    previousTraceId: orUndefined(row.previous_trace_id),
    source: orUndefined(row.source) as LogSources | undefined,
    tokensPrompt: orUndefined(row.tokens_prompt),
    tokensCached: orUndefined(row.tokens_cached),
    tokensReasoning: orUndefined(row.tokens_reasoning),
    tokensCompletion: orUndefined(row.tokens_completion),
    model: orUndefined(row.model),
    cost: orUndefined(row.cost),
  }
}
