-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE trace_search_embeddings ON CLUSTER default
    ADD COLUMN IF NOT EXISTS first_message_index Nullable(UInt32) CODEC(T64, ZSTD(1)),
    ADD COLUMN IF NOT EXISTS last_message_index  Nullable(UInt32) CODEC(T64, ZSTD(1));

-- +goose Down

ALTER TABLE trace_search_embeddings ON CLUSTER default
    DROP COLUMN IF EXISTS last_message_index,
    DROP COLUMN IF EXISTS first_message_index;
