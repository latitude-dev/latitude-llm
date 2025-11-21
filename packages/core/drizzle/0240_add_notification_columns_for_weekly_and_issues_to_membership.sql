ALTER TABLE "latitude"."memberships" ADD COLUMN "want_to_receive_weekly_email" boolean;--> statement-breakpoint
ALTER TABLE "latitude"."memberships" ADD COLUMN "want_to_receive_escalating_issues_email" boolean;--> statement-breakpoint
CREATE INDEX "want_to_receive_weekly_email_idx" ON "latitude"."memberships" USING btree ("want_to_receive_weekly_email");--> statement-breakpoint
CREATE INDEX "want_to_receive_escalating_issues_email_idx" ON "latitude"."memberships" USING btree ("want_to_receive_escalating_issues_email");