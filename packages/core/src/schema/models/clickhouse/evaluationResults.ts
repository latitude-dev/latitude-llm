export const EVALUATION_RESULTS_TABLE = 'evaluation_results' as const

export type EvaluationResultV2Row = {
  id: number
  workspace_id: number
  project_id: number
  commit_uuid: string
  document_uuid: string
  evaluation_uuid: string
  type: string | null
  metric: string | null
  model: string | null
  provider: string | null
  experiment_id: number | null
  dataset_id: number | null
  evaluated_row_id: number | null
  evaluated_log_uuid: string | null
  evaluated_span_id: string | null
  evaluated_trace_id: string | null
  score: number | null
  normalized_score: number | null
  has_passed: number | null
  tokens: number | null
  cost: number | null
  metadata: string | null
  error: string | null
  created_at: string
  updated_at: string
}
