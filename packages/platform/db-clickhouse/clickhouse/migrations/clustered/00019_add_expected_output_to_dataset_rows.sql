-- +goose NO TRANSACTION
-- +goose Up
ALTER TABLE dataset_rows ON CLUSTER default
    ADD COLUMN IF NOT EXISTS expected_output String DEFAULT '' CODEC(ZSTD(3)) AFTER output;

-- +goose Down
ALTER TABLE dataset_rows ON CLUSTER default
    DROP COLUMN IF EXISTS expected_output;
