-- Mute has been the UI's archive action since the monitors-incidents consolidation
-- (20260623104510) collapsed resolved_at/ignored_at into muted_at. With archived now
-- meaning resolved-or-ignored again, mark every muted signal as ignored so it stays
-- archived. muted_at is kept: ignoring auto-mutes, so these rows match what a fresh
-- ignore produces.
UPDATE "latitude"."signals" SET "ignored_at" = "muted_at" WHERE "muted_at" IS NOT NULL AND "ignored_at" IS NULL;
