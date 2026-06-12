-- The embedding model is configurable via LAT_AI_EMBEDDING_MODEL, so the check can no
-- longer pin a specific model name; it keeps enforcing that a materialized embedding is
-- backed by a model-stamped centroid with positive mass.
ALTER TABLE "latitude"."issues" DROP CONSTRAINT IF EXISTS "issues_centroid_embedding_consistency_check";
--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_centroid_embedding_consistency_check" CHECK (
  CASE
    WHEN centroid_embedding IS NULL THEN true
    ELSE centroid->>'model' IS NOT NULL
      AND (centroid->>'mass')::double precision > 0
  END
);
