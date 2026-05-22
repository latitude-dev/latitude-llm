CREATE TABLE "latitude"."slack_deliveries" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"integration_id" varchar(24) NOT NULL,
	"idempotency_key" text NOT NULL,
	"channel_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"message_ts" text
);
--> statement-breakpoint
ALTER TABLE "latitude"."slack_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "latitude"."slack_integration_details" ADD COLUMN "routes" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_deliveries_claim_uq" ON "latitude"."slack_deliveries" ("idempotency_key","channel_id");--> statement-breakpoint
CREATE INDEX "slack_deliveries_integration_idx" ON "latitude"."slack_deliveries" ("integration_id");--> statement-breakpoint
CREATE POLICY "slack_deliveries_organization_policy" ON "latitude"."slack_deliveries" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());