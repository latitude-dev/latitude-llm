CREATE TABLE IF NOT EXISTS spans_trace_aggregations (
  workspace_id UInt64,
  trace_id FixedString(32),
  trace_project_id_key SimpleAggregateFunction(max, UInt64),
  trace_document_uuid_key SimpleAggregateFunction(max, UUID),
  trace_commit_uuid_key SimpleAggregateFunction(max, UUID),
  completion_count SimpleAggregateFunction(sum, UInt64),
  total_tokens SimpleAggregateFunction(sum, UInt64),
  total_cost_in_millicents SimpleAggregateFunction(sum, Int64),
  total_duration SimpleAggregateFunction(sum, UInt64),
  median_cost_state AggregateFunction(quantile(0.5), Int64),
  median_duration_state AggregateFunction(quantile(0.5), UInt64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY tuple()
ORDER BY (workspace_id, trace_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS spans_trace_aggregations_mv
TO spans_trace_aggregations
AS
SELECT
  workspace_id,
  trace_id,
  max(project_id_key) AS trace_project_id_key,
  max(document_uuid_key) AS trace_document_uuid_key,
  max(commit_uuid_key) AS trace_commit_uuid_key,
  sum(if(type = 'completion', toUInt64(1), toUInt64(0))) AS completion_count,
  sum(
    if(
      type = 'completion',
      toUInt64(
        coalesce(tokens_prompt, 0) +
        coalesce(tokens_cached, 0) +
        coalesce(tokens_reasoning, 0) +
        coalesce(tokens_completion, 0)
      ),
      toUInt64(0)
    )
  ) AS total_tokens,
  sum(
    if(type = 'completion', toInt64(coalesce(cost, 0)), toInt64(0))
  ) AS total_cost_in_millicents,
  sum(
    if(type = 'completion', toUInt64(duration_ms), toUInt64(0))
  ) AS total_duration,
  quantileStateIf(0.5)(toInt64(coalesce(cost, 0)), type = 'completion') AS median_cost_state,
  quantileStateIf(0.5)(toUInt64(duration_ms), type = 'completion') AS median_duration_state
FROM spans
GROUP BY workspace_id, trace_id;

INSERT INTO spans_trace_aggregations
SELECT
  workspace_id,
  trace_id,
  max(project_id_key) AS trace_project_id_key,
  max(document_uuid_key) AS trace_document_uuid_key,
  max(commit_uuid_key) AS trace_commit_uuid_key,
  sum(if(type = 'completion', toUInt64(1), toUInt64(0))) AS completion_count,
  sum(
    if(
      type = 'completion',
      toUInt64(
        coalesce(tokens_prompt, 0) +
        coalesce(tokens_cached, 0) +
        coalesce(tokens_reasoning, 0) +
        coalesce(tokens_completion, 0)
      ),
      toUInt64(0)
    )
  ) AS total_tokens,
  sum(
    if(type = 'completion', toInt64(coalesce(cost, 0)), toInt64(0))
  ) AS total_cost_in_millicents,
  sum(
    if(type = 'completion', toUInt64(duration_ms), toUInt64(0))
  ) AS total_duration,
  quantileStateIf(0.5)(toInt64(coalesce(cost, 0)), type = 'completion') AS median_cost_state,
  quantileStateIf(0.5)(toUInt64(duration_ms), type = 'completion') AS median_duration_state
FROM spans
GROUP BY workspace_id, trace_id;
