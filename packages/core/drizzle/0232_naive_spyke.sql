ALTER TABLE "latitude"."issues" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD COLUMN "centroid" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD COLUMN "merged_at" timestamp;--> statement-breakpoint
CREATE INDEX "issues_merged_at_idx" ON "latitude"."issues" USING btree ("merged_at");--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_uuid_unique" UNIQUE("uuid");