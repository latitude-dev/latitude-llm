ALTER TABLE "latitude"."alert_incidents" ADD COLUMN "entry_signals" jsonb;--> statement-breakpoint
ALTER TABLE "latitude"."alert_incidents" ADD COLUMN "exit_eligible_since" timestamp with time zone;