-- +goose NO TRANSACTION
-- +goose Up
ALTER TABLE dataset_rows
    ADD COLUMN IF NOT EXISTS expected_output String DEFAULT '' CODEC(ZSTD(3)) AFTER output;

-- +goose Down
ALTER TABLE dataset_rows
    DROP COLUMN IF EXISTS expected_output;
