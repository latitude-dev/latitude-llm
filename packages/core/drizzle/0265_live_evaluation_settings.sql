-- Migrate existing data from evaluate_live_logs into configuration.trigger
UPDATE "latitude"."evaluation_versions"
SET "configuration" = "configuration" || jsonb_build_object(
  'trigger', jsonb_build_object(
    'mode', COALESCE("evaluate_live_logs", false) ? 'every_interaction' : 'disabled'
  )
);
--> statement-breakpoint

-- Drop the old column
ALTER TABLE "latitude"."evaluation_versions" DROP COLUMN "evaluate_live_logs";
