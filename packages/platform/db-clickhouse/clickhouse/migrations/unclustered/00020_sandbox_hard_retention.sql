-- +goose NO TRANSACTION
-- +goose Up

-- Sandbox orgs (parent_org_id != null) ingest telemetry with a short per-row retention_days
-- (SANDBOX_SPAN_RETENTION_DAYS = 7), set at ingest by resolveEffectivePlanCached. The plan-aware
-- TTL adds a 30-day grace buffer before hard delete, which would keep a 7-day sandbox row alive
-- ~37 days and defeat the structural storage bound. The second DELETE rule below drops sub-live-plan
-- rows (retention_days < 30, i.e. below the smallest live plan's retention) at exactly
-- start_time + retention_days with no grace, while the first rule leaves live-org retention (>= 30)
-- untouched. Applied to every table that holds sandbox telemetry: spans plus the traces and sessions
-- materialized from them (search/embedding/observation tables get no sandbox rows — that LLM work is
-- gated off for sandboxes, see AGE-127).
--
-- SETTINGS materialize_ttl_after_modify = 0: by default MODIFY TTL re-materializes TTL across ALL
-- existing parts, which would rewrite every part of these (large, high-volume) tables at deploy time.
-- We skip that — the new rule applies to newly inserted parts and to existing parts as they are
-- naturally merged. This is safe because the live rule (retention_days + 30) is byte-identical to the
-- previous TTL, so no existing row's delete time moves; only sandbox rows (retention_days < 30) take
-- the tighter bound, and they do so as their parts merge rather than via one big upfront mutation.

ALTER TABLE spans
    MODIFY TTL
        toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE,
        toDateTime(start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30
    SETTINGS materialize_ttl_after_modify = 0;

ALTER TABLE traces
    MODIFY TTL
        toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
        toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30
    SETTINGS materialize_ttl_after_modify = 0;

ALTER TABLE sessions
    MODIFY TTL
        toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
        toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30
    SETTINGS materialize_ttl_after_modify = 0;

-- +goose Down

ALTER TABLE sessions
    MODIFY TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE
    SETTINGS materialize_ttl_after_modify = 0;

ALTER TABLE traces
    MODIFY TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE
    SETTINGS materialize_ttl_after_modify = 0;

ALTER TABLE spans
    MODIFY TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE
    SETTINGS materialize_ttl_after_modify = 0;
