ALTER TABLE "latitude"."grants" DROP CONSTRAINT "grants_uuid_unique";--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ALTER COLUMN "token" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ALTER COLUMN "token" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "latitude"."outbox_events" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."outbox_events" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "latitude"."outbox_events" ALTER COLUMN "aggregate_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."outbox_events" ALTER COLUMN "workspace_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."grants" DROP COLUMN "uuid";