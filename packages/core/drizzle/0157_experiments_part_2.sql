DROP INDEX IF EXISTS "tokens_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cost_in_millicents_idx";--> statement-breakpoint
ALTER TABLE "latitude"."experiments" ALTER COLUMN "dataset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."document_logs" ADD COLUMN "experiment_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."experiments" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."experiments" ADD COLUMN "workspace_id" bigint NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_logs" ADD CONSTRAINT "document_logs_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "latitude"."experiments"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."experiments" ADD CONSTRAINT "experiments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_logs_experiment_id_idx" ON "latitude"."document_logs" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiments_workspace_id_idx" ON "latitude"."experiments" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "latitude"."experiments" ADD CONSTRAINT "experiments_uuid_unique" UNIQUE("uuid");