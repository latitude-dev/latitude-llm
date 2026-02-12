export const SPANS_TABLE = 'spans' as const

export type SpanRow = {
  workspace_id: number
  trace_id: string
  span_id: string
  parent_id: string | null
  previous_trace_id: string | null

  api_key_id: number
  document_log_uuid: string | null
  document_uuid: string | null
  commit_uuid: string | null
  experiment_uuid: string | null
  project_id: number | null
  test_deployment_id: number | null

  name: string
  kind: string
  type: string
  status: string
  message: string | null
  duration_ms: number
  started_at: string
  ended_at: string
  source: string | null

  provider: string
  model: string | null
  cost: number | null
  tokens_prompt: number | null
  tokens_cached: number | null
  tokens_reasoning: number | null
  tokens_completion: number | null

  ingested_at: string
  retention_expires_at: string
}
