ALTER TABLE "latitude"."issues" ADD COLUMN "escalating_at" timestamp;--> statement-breakpoint
CREATE INDEX "issues_escalating_at_idx" ON "latitude"."issues" USING btree ("escalating_at");