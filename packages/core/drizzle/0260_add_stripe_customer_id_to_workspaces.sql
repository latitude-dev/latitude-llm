ALTER TABLE "latitude"."subscriptions" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."workspaces" ADD COLUMN "stripe_customer_id" varchar(256);--> statement-breakpoint
CREATE INDEX "subscriptions_cancelled_at_index" ON "latitude"."subscriptions" USING btree ("cancelled_at");