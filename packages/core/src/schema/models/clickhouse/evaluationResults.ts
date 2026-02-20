export type EvaluationResultV2Row = {
  id: string
  workspace_id: string
  project_id: string
  commit_uuid: string
  document_uuid: string
  evaluation_uuid: string
  type: string | null
  metric: string | null
  model: string | null
  provider: string | null
  experiment_id: string | null
  dataset_id: string | null
  evaluated_row_id: string | null
  session_id: string | null
  evaluated_span_id: string | null
  evaluated_trace_id: string | null
  score: string | null
  normalized_score: string | null
  has_passed: number | null
  tokens: string | null
  cost: string | null
  metadata: string | null
  error: string | null
  issue_ids: number[]
  created_at: string
  updated_at: string
}

export type EvaluationResultV2Input = Omit<EvaluationResultV2Row, 'id'>

export const TABLE_NAME = 'evaluation_results' as const
export const TABLE_CONFIG = {
  engine: 'ReplacingMergeTree',
  primaryKey: ['workspace_id', 'project_id', 'evaluation_uuid', 'created_at'],
  orderBy: [
    'workspace_id',
    'project_id',
    'evaluation_uuid',
    'created_at',
    'id',
  ],
  partitionBy: 'toYYYYMM(created_at)',
  indices: [
    {
      name: 'idx_evaluated_trace_span',
      columns: ['evaluated_span_id', 'evaluated_trace_id'],
      type: 'bloom_filter',
    },
  ],
} as const
