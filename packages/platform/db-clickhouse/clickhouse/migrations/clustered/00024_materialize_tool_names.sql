-- +goose NO TRANSACTION
-- +goose Up

-- Backfill tool_names (and its index) on parts written before 00023 so reads
-- stop computing the column on the fly from the ZSTD(3) tool_definitions blob.
-- These submit background mutations; they do not block.
ALTER TABLE spans ON CLUSTER default MATERIALIZE COLUMN tool_names;
ALTER TABLE spans ON CLUSTER default MATERIALIZE INDEX idx_tool_name;
ALTER TABLE spans ON CLUSTER default MATERIALIZE INDEX idx_tool_names;

-- +goose Down

-- No-op: materialization cannot (and need not) be reversed.
SELECT 1;
