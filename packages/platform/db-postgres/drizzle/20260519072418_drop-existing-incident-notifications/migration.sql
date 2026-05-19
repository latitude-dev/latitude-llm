-- The notification payload shape for incident kinds is being reshaped
-- (generic source-id base, sustained kinds carry a trend snapshot, new
-- `incident.event` kind replacing `incident.opened` for one-shot
-- incidents). Existing rows would fail the new payload schema at read
-- time. The `notifications` feature flag is off in production and
-- staging re-seeds on `pnpm db:reset`, so dropping the rows is simpler
-- than a conditional backfill.
DELETE FROM "latitude"."notifications" WHERE kind IN ('incident.opened', 'incident.closed');
