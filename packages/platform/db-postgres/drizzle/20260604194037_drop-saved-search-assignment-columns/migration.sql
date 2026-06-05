DROP INDEX "latitude"."saved_searches_assigned_user_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."saved_searches" DROP COLUMN "assigned_user_id";--> statement-breakpoint
ALTER TABLE "latitude"."saved_searches" DROP COLUMN "created_by_user_id";