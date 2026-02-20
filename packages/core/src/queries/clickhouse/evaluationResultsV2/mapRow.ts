import {
  EvaluationResultError,
  EvaluationResultMetadata,
  EvaluationResultV2,
  EvaluationType,
  RuleEvaluationMetric,
} from '../../../constants'
import { EvaluationResultV2Row } from '../../../schema/models/clickhouse/evaluationResults'

export function mapRow(row: EvaluationResultV2Row): EvaluationResultV2 {
  let metadata: Record<string, unknown> | null = null
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata)
    } catch {
      metadata = null
    }
  }

  let error: EvaluationResultError | null = null
  if (row.error) {
    try {
      error = JSON.parse(row.error)
    } catch {
      error = null
    }
  }

  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    evaluationUuid: row.evaluation_uuid,
    experimentId: Number(row.experiment_id) || null,
    datasetId: Number(row.dataset_id) || null,
    evaluatedRowId: Number(row.evaluated_row_id) || null,
    evaluatedSpanId: row.evaluated_span_id,
    evaluatedTraceId: row.evaluated_trace_id,
    type: row.type as EvaluationType | null,
    metric: row.metric as RuleEvaluationMetric,
    model: row.model,
    provider: row.provider,
    score: row.score !== null ? Number(row.score) : 0,
    normalizedScore:
      row.normalized_score !== null ? Number(row.normalized_score) : 0,
    hasPassed: row.has_passed === null ? false : row.has_passed === 1,
    metadata: metadata as EvaluationResultMetadata,
    error: error as EvaluationResultError | null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    commitUuid: row.commit_uuid,
    documentUuid: row.document_uuid,
    tokens: row.tokens ? Number(row.tokens) : null,
    cost: row.cost ? Number(row.cost) : null,
  } as EvaluationResultV2
}
