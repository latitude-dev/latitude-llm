-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE sessions
    ADD INDEX IF NOT EXISTS idx_sessions_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 2;

ALTER TABLE sessions
    MATERIALIZE INDEX idx_sessions_session_id;

-- +goose Down

ALTER TABLE sessions
    DROP INDEX IF EXISTS idx_sessions_session_id;
