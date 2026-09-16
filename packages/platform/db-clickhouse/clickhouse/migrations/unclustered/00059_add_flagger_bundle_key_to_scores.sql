-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE scores
    ADD COLUMN IF NOT EXISTS flagger_bundle_key Nullable(String) CODEC(ZSTD(1)) AFTER flagger_finding_kind;

-- +goose Down

ALTER TABLE scores
    DROP COLUMN IF EXISTS flagger_bundle_key;
