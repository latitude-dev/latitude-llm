-- +goose NO TRANSACTION
-- +goose Up

-- Tool names offered to the LLM on chat spans, extracted from the
-- tool_definitions JSON blob so tool analytics can aggregate without
-- decompressing the full ZSTD(3) payload. '' parses to [] (JSONExtractArrayRaw('') = []).
-- MATERIALIZED: old parts compute it on the fly at read until 00024 backfills.
-- Keep one ALTER per table to reduce DDL metadata churn on replicated clusters.
ALTER TABLE spans ON CLUSTER default
    ADD COLUMN IF NOT EXISTS tool_names Array(LowCardinality(String))
        MATERIALIZED arrayMap(x -> JSONExtractString(x, 'name'), JSONExtractArrayRaw(tool_definitions))
        CODEC(ZSTD(1)) AFTER tool_output,
    ADD INDEX IF NOT EXISTS idx_tool_name  tool_name  TYPE bloom_filter(0.01) GRANULARITY 4,
    ADD INDEX IF NOT EXISTS idx_tool_names tool_names TYPE bloom_filter(0.01) GRANULARITY 4;

-- +goose Down

ALTER TABLE spans ON CLUSTER default
    DROP INDEX IF EXISTS idx_tool_names,
    DROP INDEX IF EXISTS idx_tool_name,
    DROP COLUMN IF EXISTS tool_names;
