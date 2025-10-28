ALTER TABLE "latitude"."users" ADD COLUMN "role" varchar(128);--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "latitude"."users" USING btree ("role");