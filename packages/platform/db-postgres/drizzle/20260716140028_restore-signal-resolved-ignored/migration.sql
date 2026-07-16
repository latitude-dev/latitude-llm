ALTER TABLE "latitude"."signals" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "latitude"."signals" ADD COLUMN "ignored_at" timestamp with time zone;--> statement-breakpoint
DROP INDEX "latitude"."signals_project_lifecycle_idx";--> statement-breakpoint
CREATE INDEX "signals_project_lifecycle_idx" ON "latitude"."signals" ("organization_id","project_id","ignored_at","resolved_at","muted_at","created_at");