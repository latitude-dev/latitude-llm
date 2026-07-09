ALTER TABLE "latitude"."agent_dispatch_configs" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatch_configs" ALTER COLUMN "enabled" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatch_configs" ALTER COLUMN "enabled" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatch_configs" ALTER COLUMN "triggers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatch_configs" ALTER COLUMN "target" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatch_configs" ALTER COLUMN "guardrails" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatch_configs_default_uq" ON "latitude"."agent_dispatch_configs" ("integration_id") WHERE "project_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatch_configs_project_integration_uq" ON "latitude"."agent_dispatch_configs" ("project_id","integration_id") WHERE "project_id" IS NOT NULL;