-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE session_semantic_moments
    ADD INDEX IF NOT EXISTS idx_session_semantic_moments_embedding_ann embedding
    TYPE vector_similarity('hnsw', 'cosineDistance', 2048);

ALTER TABLE session_semantic_moments
    MATERIALIZE INDEX idx_session_semantic_moments_embedding_ann;

-- +goose Down

ALTER TABLE session_semantic_moments
    DROP INDEX IF EXISTS idx_session_semantic_moments_embedding_ann;
