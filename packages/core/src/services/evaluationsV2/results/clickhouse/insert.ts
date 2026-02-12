import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../../../../constants'
import {
  EVALUATION_RESULTS_V2_TABLE,
  EvaluationResultV2Row,
} from '../../../../clickhouse/models/evaluationResultsV2'
import { insertRows, toClickHouseDateTime } from '../../../../clickhouse/insert'
import { type Commit } from '../../../../schema/models/types/Commit'
import { TypedResult } from '../../../../lib/Result'

/**
 * Inserts a single evaluation result row into ClickHouse.
 */
export async function insertEvaluationResultV2Row({
  result,
  evaluation,
  commit,
}: {
  result: EvaluationResultV2
  evaluation: EvaluationV2
  commit: Commit
}): Promise<TypedResult<undefined>> {
  const row = toRow({ result, evaluation, commit })
  return insertRows(EVALUATION_RESULTS_V2_TABLE, [row])
}

function toRow({
  result,
  evaluation,
  commit,
}: {
  result: EvaluationResultV2
  evaluation: EvaluationV2
  commit: Commit
}): EvaluationResultV2Row {
  const { provider, model } = getProviderAndModel(evaluation)
  const metadata = serializeJson(result.metadata)
  const error = serializeJson(result.error)
  const tokens =
    evaluation.type === EvaluationType.Llm
      ? getMetadataNumber(result.metadata, 'tokens')
      : null
  const cost =
    evaluation.type === EvaluationType.Llm
      ? getMetadataNumber(result.metadata, 'cost')
      : null

  return {
    id: result.id,
    uuid: result.uuid,
    workspace_id: result.workspaceId,
    project_id: commit.projectId,
    commit_id: commit.id,
    commit_uuid: commit.uuid,
    document_uuid: evaluation.documentUuid,
    evaluation_uuid: evaluation.uuid,
    evaluation_name: evaluation.name,
    type: evaluation.type ?? null,
    metric: evaluation.metric ?? null,
    model,
    provider,
    experiment_id: result.experimentId ?? null,
    dataset_id: result.datasetId ?? null,
    evaluated_row_id: result.evaluatedRowId ?? null,
    evaluated_log_id: getEvaluatedLogId(result),
    evaluated_span_id: result.evaluatedSpanId ?? null,
    evaluated_trace_id: result.evaluatedTraceId ?? null,
    score: result.score ?? null,
    normalized_score: result.normalizedScore ?? null,
    has_passed: toNullableUInt8(result.hasPassed),
    tokens,
    cost,
    metadata,
    error,
    created_at: toClickHouseDateTime(result.createdAt),
    updated_at: toClickHouseDateTime(result.updatedAt),
  }
}

function getProviderAndModel(evaluation: EvaluationV2): {
  provider: string | null
  model: string | null
} {
  if (evaluation.type !== EvaluationType.Llm) {
    return { provider: null, model: null }
  }

  const configuration = evaluation.configuration as {
    provider?: string | null
    model?: string | null
  }
  const provider =
    typeof configuration.provider === 'string'
      ? configuration.provider.trim()
      : ''
  const model =
    typeof configuration.model === 'string' ? configuration.model.trim() : ''

  return {
    provider: provider.length ? provider : null,
    model: model.length ? model : null,
  }
}

function getMetadataNumber(
  metadata: EvaluationResultV2['metadata'],
  key: 'tokens' | 'cost',
): number | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : null
}

function getEvaluatedLogId(result: EvaluationResultV2): number | null {
  const value = (
    result as EvaluationResultV2 & { evaluatedLogId?: number | null }
  ).evaluatedLogId
  return value ?? null
}

function toNullableUInt8(value: boolean | null | undefined): number | null {
  if (value === true) return 1
  if (value === false) return 0
  return null
}

function serializeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}
