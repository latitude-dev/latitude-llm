ALTER TYPE "latitude"."metadata_type" ADD VALUE 'manual';--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_metadata_default" RENAME TO "evaluation_metadata_manuals";
