-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE sessions ON CLUSTER default
    ADD INDEX IF NOT EXISTS idx_sessions_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 2;

ALTER TABLE sessions ON CLUSTER default
    MATERIALIZE INDEX idx_sessions_session_id;

-- +goose Down

ALTER TABLE sessions ON CLUSTER default
    DROP INDEX IF EXISTS idx_sessions_session_id;
