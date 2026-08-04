-- +goose NO TRANSACTION
-- +goose Up

-- Record the pricing modifiers a provider reports in its response `usage` object and that no token
-- count can express: how long each cache write was bought for, which speed tier served the request,
-- and where inference ran. Pricing from tokens alone undercounts whenever any of them is in play,
-- and only ever in that direction.
--
-- `tokens_cache_create_by_ttl` is a SUBSET of `tokens_cache_create`, not a sibling of it. The
-- scalar stays the authoritative total because `tokens_total` is MATERIALIZED as
-- `tokens_input + tokens_output + tokens_cache_read + tokens_cache_create + tokens_reasoning`, so a
-- column that also summed into the total would double-count it and traces_mv / sessions_mv would
-- start disagreeing with the spans they roll up. Nothing here touches either view: the split is a
-- span-level explanation of a total the rollups already carry.
--
-- Keyed by TTL in seconds, never by tier name. A `cache_1h` column would bake one provider's one
-- tier into the schema, while OpenAI's extended retention runs to 24 hours and Gemini takes an
-- arbitrary TTL. `@domain/models` already speaks in `ttlSeconds`.
--
-- `service_tier` is normalized across providers (Anthropic's `usage.speed`, OpenAI's
-- `service_tier`) rather than a per-provider `fast_mode` flag the next provider's tier would not
-- fit. Both it and `inference_geo` are empty on every row stored before this migration, and empty
-- reads as "unreported" — which prices at the standard rate, exactly as those rows already did.

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS tokens_cache_create_by_ttl Map(UInt32, UInt32)
        CODEC(ZSTD(1)) AFTER tokens_reasoning,
    ADD COLUMN IF NOT EXISTS service_tier LowCardinality(String)
        DEFAULT '' CODEC(ZSTD(1)) AFTER cost_priced_model,
    ADD COLUMN IF NOT EXISTS inference_geo LowCardinality(String)
        DEFAULT '' CODEC(ZSTD(1)) AFTER service_tier;

-- +goose Down

ALTER TABLE spans
    DROP COLUMN IF EXISTS tokens_cache_create_by_ttl,
    DROP COLUMN IF EXISTS service_tier,
    DROP COLUMN IF EXISTS inference_geo;
