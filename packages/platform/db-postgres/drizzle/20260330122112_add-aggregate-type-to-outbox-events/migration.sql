ALTER TABLE "latitude"."outbox_events" ADD COLUMN "aggregate_type" text NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "latitude"."outbox_events" ALTER COLUMN "aggregate_type" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_type_idx" ON "latitude"."outbox_events" ("aggregate_type");