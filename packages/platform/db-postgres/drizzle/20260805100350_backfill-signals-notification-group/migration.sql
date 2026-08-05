-- Custom SQL migration file, put your code below! --
-- Signal notifications moved out of the `incidents` group (monitors) into their own
-- `signals` group. Both jsonb columns are keyed by group name, so the code now reads a
-- key that does not exist yet: without this backfill every org with a monitors Slack
-- channel silently stops receiving new-signal messages. Copying forward keeps today's
-- delivery intact and leaves narrowing to the per-channel priority filter.
--
-- Only the channel carries over. `minSeverity` is the incident axis and never matches a
-- signal payload, so copying it would leave a dead knob on the signals route.
--
-- Guarded on the `signals` key being absent, so re-running cannot clobber a route
-- configured between this migration and the code rollout.
UPDATE "latitude"."slack_integration_details"
SET routes = jsonb_set(
  routes,
  '{signals}',
  (
    SELECT coalesce(jsonb_agg(jsonb_build_object('channelId', r->'channelId', 'channelName', r->'channelName')), '[]'::jsonb)
    FROM jsonb_array_elements(routes->'incidents') AS r
  )
)
WHERE routes ? 'incidents'
  AND NOT routes ? 'signals'
  AND jsonb_array_length(routes->'incidents') > 0;--> statement-breakpoint
-- Email prefs only need the explicit opt-outs: a missing group already means opt-in, so
-- users who never touched settings keep getting signal email either way. Someone who
-- turned monitors off would otherwise start receiving signal email. `emailMinSeverity`
-- is deliberately not copied — severity is the incident axis, priority is the signal one.
UPDATE "latitude"."users"
SET notification_preferences = jsonb_set(notification_preferences, '{signals}', '{"email": false}'::jsonb)
WHERE notification_preferences->'incidents'->>'email' = 'false'
  AND NOT notification_preferences ? 'signals';
