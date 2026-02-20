export type SpanRow = {
  workspace_id: string
  trace_id: string
  span_id: string
  parent_id: string | null
  previous_trace_id: string | null

  api_key_id: string
  document_log_uuid: string | null
  document_uuid: string | null
  commit_uuid: string | null
  commit_uuid_key: string
  experiment_uuid: string | null
  project_id: string | null
  project_id_key: string
  document_uuid_key: string
  test_deployment_id: string | null

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
  cost: string | null
  tokens_prompt: string | null
  tokens_cached: string | null
  tokens_reasoning: string | null
  tokens_completion: string | null

  ingested_at: string
  retention_expires_at: string
}

export type SpanInput = Omit<
  SpanRow,
  'commit_uuid_key' | 'project_id_key' | 'document_uuid_key'
>

export const TABLE_NAME = 'spans' as const
export const TABLE_CONFIG = {
  engine: 'ReplacingMergeTree',
  primaryKey: [
    'workspace_id',
    'project_id_key',
    'commit_uuid_key',
    'document_uuid_key',
    'started_at',
  ],
  orderBy: [
    'workspace_id',
    'project_id_key',
    'commit_uuid_key',
    'document_uuid_key',
    'started_at',
    'trace_id',
    'span_id',
  ],
  partitionBy: 'toYYYYMM(started_at)',
  indices: [
    { name: 'idx_trace_id', columns: ['trace_id'], type: 'bloom_filter' },
    {
      name: 'idx_span_trace_ids',
      columns: ['span_id', 'trace_id'],
      type: 'bloom_filter',
    },
    {
      name: 'idx_document_log_uuid',
      columns: ['document_log_uuid'],
      type: 'bloom_filter',
    },
    {
      name: 'idx_experiment_uuid',
      columns: ['experiment_uuid'],
      type: 'bloom_filter',
    },
    { name: 'idx_parent_id', columns: ['parent_id'], type: 'bloom_filter' },
    {
      name: 'idx_test_deployment_id',
      columns: ['test_deployment_id'],
      type: 'bloom_filter',
    },
  ],
  materializedColumns: [
    {
      name: 'commit_uuid_key',
      expression:
        "ifNull(commit_uuid, toUUID('00000000-0000-0000-0000-000000000000'))",
    },
    { name: 'project_id_key', expression: 'ifNull(project_id, 0)' },
    {
      name: 'document_uuid_key',
      expression:
        "ifNull(document_uuid, toUUID('00000000-0000-0000-0000-000000000000'))",
    },
  ],
} as const
