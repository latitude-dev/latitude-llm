-- +goose NO TRANSACTION
-- +goose Up
ALTER TABLE dataset_rows ON CLUSTER default
    ADD COLUMN IF NOT EXISTS custom String DEFAULT '' CODEC(ZSTD(3)) AFTER metadata;

-- +goose Down
ALTER TABLE dataset_rows ON CLUSTER default
    DROP COLUMN IF EXISTS custom;
