-- Fixed migration
ALTER TABLE "latitude"."evaluation_versions" DROP COLUMN IF EXISTS "alignment_metric";