ALTER TABLE "latitude"."users" ALTER COLUMN "encrypted_password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."users" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."memberships" ADD COLUMN "id" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."memberships" ADD COLUMN "invitation_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."memberships" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_invitation_token_index" ON "latitude"."memberships" USING btree ("invitation_token");--> statement-breakpoint
ALTER TABLE "latitude"."memberships" ADD CONSTRAINT "memberships_invitation_token_unique" UNIQUE("invitation_token");