-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE scores ON CLUSTER default
    ADD COLUMN IF NOT EXISTS flagger_finding_kind Nullable(String) CODEC(ZSTD(1)) AFTER flagger_path;

-- +goose Down

ALTER TABLE scores ON CLUSTER default
    DROP COLUMN IF EXISTS flagger_finding_kind;
