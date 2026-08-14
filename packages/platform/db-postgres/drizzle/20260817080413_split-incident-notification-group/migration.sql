-- Custom SQL migration file, put your code below! --
-- The `incidents` notification group covered both signals and monitors under one toggle.
-- It is now two groups (`signals`, `monitors`), so every stored setting is copied to both:
-- whoever muted incidents, or routed them to a channel, meant it for both halves.
-- Keys mirror `NOTIFICATION_GROUPS` in @domain/shared.
UPDATE "latitude"."users"
SET notification_preferences =
  (notification_preferences - 'incidents')
  || jsonb_build_object(
       'signals', notification_preferences -> 'incidents',
       'monitors', notification_preferences -> 'incidents'
     )
WHERE notification_preferences ? 'incidents';--> statement-breakpoint
UPDATE "latitude"."slack_integration_details"
SET routes =
  (routes - 'incidents')
  || jsonb_build_object(
       'signals', routes -> 'incidents',
       'monitors', routes -> 'incidents'
     )
WHERE routes ? 'incidents';
