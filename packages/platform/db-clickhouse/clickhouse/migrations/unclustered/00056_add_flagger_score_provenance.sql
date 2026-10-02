-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE scores
    ADD COLUMN IF NOT EXISTS flagger_slug Nullable(String) CODEC(ZSTD(1)) AFTER source_id,
    ADD COLUMN IF NOT EXISTS scoring_artifact_version Nullable(String) CODEC(ZSTD(1)) AFTER flagger_slug,
    ADD COLUMN IF NOT EXISTS flagger_finding_key Nullable(String) CODEC(ZSTD(1)) AFTER scoring_artifact_version,
    ADD COLUMN IF NOT EXISTS flagger_path Nullable(String) CODEC(ZSTD(1)) AFTER flagger_finding_key;

-- +goose Down

ALTER TABLE scores
    DROP COLUMN IF EXISTS flagger_path,
    DROP COLUMN IF EXISTS flagger_finding_key,
    DROP COLUMN IF EXISTS scoring_artifact_version,
    DROP COLUMN IF EXISTS flagger_slug;
