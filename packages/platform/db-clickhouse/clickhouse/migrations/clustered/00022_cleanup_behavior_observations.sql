-- +goose NO TRANSACTION
-- +goose Up

DROP TABLE IF EXISTS behavior_observations ON CLUSTER default;

-- +goose Down

-- Dropping the deprecated behavior observations table is irreversible.
SELECT 1;
