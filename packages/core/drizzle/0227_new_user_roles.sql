ALTER TABLE "latitude"."users" ADD COLUMN "title" varchar(128);--> statement-breakpoint
CREATE INDEX "users_title_idx" ON "latitude"."users" USING btree ("title");