-- +goose NO TRANSACTION
-- +goose Up
ALTER TABLE dataset_rows
    ADD COLUMN IF NOT EXISTS custom String DEFAULT '' CODEC(ZSTD(3)) AFTER metadata;

-- +goose Down
ALTER TABLE dataset_rows
    DROP COLUMN IF EXISTS custom;
