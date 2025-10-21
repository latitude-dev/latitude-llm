CREATE TABLE "latitude"."document_trigger_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"commit_id" bigint NOT NULL,
	"trigger_uuid" uuid NOT NULL,
	"trigger_type" "latitude"."document_trigger_types" NOT NULL,
	"payload" jsonb,
	"document_log_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" DROP CONSTRAINT "document_triggers_uuid_unique";--> statement-breakpoint
DROP INDEX "latitude"."scheduled_trigger_next_run_time_idx";--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" ALTER COLUMN "configuration" SET NOT NULL;--> statement-breakpoint

-- Add commit_id and populate it with the live commit from each trigger's project
ALTER TABLE "latitude"."document_triggers" ADD COLUMN "commit_id" bigint;
WITH "latest_commit" AS (
  SELECT
    "id",
    "project_id",
    ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "merged_at" DESC) AS rn
  FROM "latitude"."commits"
  WHERE "merged_at" IS NOT NULL
)
UPDATE "latitude"."document_triggers" dt
SET "commit_id" = lc.id
FROM "latest_commit" lc
WHERE dt."project_id" = lc."project_id" AND lc.rn = 1;
ALTER TABLE "latitude"."document_triggers" ALTER COLUMN "commit_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "latitude"."document_triggers" ADD COLUMN "deployment_settings" jsonb;--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" ADD COLUMN "enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."document_trigger_events" ADD CONSTRAINT "document_trigger_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."document_trigger_events" ADD CONSTRAINT "document_trigger_events_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."document_trigger_events" ADD CONSTRAINT "document_trigger_events_document_log_uuid_document_logs_uuid_fk" FOREIGN KEY ("document_log_uuid") REFERENCES "latitude"."document_logs"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_trigger_events_workspace_idx" ON "latitude"."document_trigger_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_trigger_events_trigger_uuid_idx" ON "latitude"."document_trigger_events" USING btree ("trigger_uuid");--> statement-breakpoint
CREATE INDEX "document_trigger_events_document_log_uuid_idx" ON "latitude"."document_trigger_events" USING btree ("document_log_uuid");--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" ADD CONSTRAINT "document_triggers_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_triggers_uuid_commit_unique" ON "latitude"."document_triggers" USING btree ("uuid","commit_id");--> statement-breakpoint
CREATE INDEX "scheduled_trigger_next_run_time_idx" ON "latitude"."document_triggers" USING btree ((deployment_settings->>'nextRunTime'));

-- SET ALL CURRENT TRIGGERS TO DEPLOYED AND ENABLED
UPDATE "latitude"."document_triggers"
SET "enabled" = true;

-- For trigger_type='scheduled' -> move { lastRun, nextRunTime } from configuration to deployment_settings
UPDATE "latitude"."document_triggers"
SET "deployment_settings" = jsonb_build_object(
	'lastRun', "configuration"->'lastRun',
	'nextRunTime', "configuration"->'nextRunTime'
)
WHERE "trigger_type" = 'scheduled';

-- For trigger_type='integration' -> move { triggerId } from configuration to deployment_settings
UPDATE "latitude"."document_triggers"
SET "deployment_settings" = jsonb_build_object(
	'triggerId', "configuration"->'triggerId'
)
WHERE "trigger_type" = 'integration';

-- For trigger_type='email' -> just set deployment_settings to {}
UPDATE "latitude"."document_triggers"
SET "deployment_settings" = '{}'::jsonb
WHERE "trigger_type" = 'email';
--> statement-breakpoint
