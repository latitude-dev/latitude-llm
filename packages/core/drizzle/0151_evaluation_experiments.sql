DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'api' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'log_source')) THEN
	ALTER TYPE "latitude"."log_source" ADD VALUE 'api';
 END IF;
END $$;
--> statement-breakpoint
ALTER TYPE "latitude"."log_source" ADD VALUE 'experiment';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."experiments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"commit_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"evaluation_uuids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"dataset_id" bigint,
	"metadata" jsonb NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."experiments" ADD CONSTRAINT "experiments_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."experiments" ADD CONSTRAINT "experiments_dataset_id_datasets_v2_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "latitude"."datasets_v2"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiments_document_uuid_idx" ON "latitude"."experiments" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiments_document_commit_idx" ON "latitude"."experiments" USING btree ("commit_id","document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiments_dataset_id_idx" ON "latitude"."experiments" USING btree ("dataset_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "latitude"."experiments"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
