DROP POLICY "subscription_organization_policy" ON "latitude"."subscription";--> statement-breakpoint
DROP POLICY "grants_organization_policy" ON "latitude"."grants";--> statement-breakpoint
DROP TABLE "latitude"."subscription";--> statement-breakpoint
DROP TABLE "latitude"."grants";--> statement-breakpoint
ALTER TABLE "latitude"."organization" DROP COLUMN "current_subscription_id";--> statement-breakpoint
ALTER TABLE "latitude"."organization" DROP COLUMN "stripe_customer_id";