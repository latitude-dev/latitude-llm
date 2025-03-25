ALTER TABLE "latitude"."webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_event_id_events_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "webhook_deliveries_event_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."webhook_deliveries" ADD COLUMN "event_type" varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."webhook_deliveries" DROP COLUMN IF EXISTS "event_id";