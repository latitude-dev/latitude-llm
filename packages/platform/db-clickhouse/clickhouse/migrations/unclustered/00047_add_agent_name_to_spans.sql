-- +goose NO TRANSACTION
-- +goose Up

-- Persist the resolved agent name on each span — unclustered variant.
-- Mirrors `model`: resolved ungated from a ranked candidate attribute list, so
-- SDKs that stamp the agent name on every in-scope span feed the distinct rollup
-- on sessions/traces (00047/00048). Empty string when no source emits a name.

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS agent_name LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER model;

-- +goose Down

ALTER TABLE spans
    DROP COLUMN IF EXISTS agent_name;
