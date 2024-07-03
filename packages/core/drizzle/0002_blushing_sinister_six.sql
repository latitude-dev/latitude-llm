DROP INDEX IF EXISTS "prompt_version_idx";--> statement-breakpoint
ALTER TABLE "latitude"."convos" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."convos" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commit_next_commit_idx" ON "latitude"."commits" USING btree ("next_commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "convo_prompt_version_idx" ON "latitude"."convos" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_snapshot_prompt_version_idx" ON "latitude"."prompt_snapshots" USING btree ("prompt_version_id");