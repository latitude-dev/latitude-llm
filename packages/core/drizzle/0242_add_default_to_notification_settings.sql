ALTER TABLE "latitude"."memberships" ALTER COLUMN "want_to_receive_weekly_email" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "latitude"."memberships" ALTER COLUMN "want_to_receive_escalating_issues_email" SET DEFAULT true;--> statement-breakpoint

-- Backfill existing null values
UPDATE "latitude"."memberships" SET "want_to_receive_weekly_email" = true WHERE "want_to_receive_weekly_email" IS NULL;--> statement-breakpoint
UPDATE "latitude"."memberships" SET "want_to_receive_escalating_issues_email" = true WHERE "want_to_receive_escalating_issues_email" IS NULL;
