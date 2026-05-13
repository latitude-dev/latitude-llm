-- +goose NO TRANSACTION
-- +goose Up

DROP TABLE IF EXISTS trace_search_embeddings_legacy ON CLUSTER default;

-- +goose Down

-- Dropping the legacy pre-chunked trace search embeddings table is irreversible.
SELECT 1;
