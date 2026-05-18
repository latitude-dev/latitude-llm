ALTER TABLE "latitude"."issues" ADD COLUMN "centroid_embedding" vector(2048);
--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B')
) STORED;
--> statement-breakpoint
ALTER TABLE "latitude"."issues" ALTER COLUMN "search_document" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_centroid_embedding_consistency_check" CHECK (
  CASE
    WHEN centroid_embedding IS NULL THEN true
    ELSE centroid->>'model' = 'voyage-4-large'
      AND (centroid->>'mass')::double precision > 0
  END
);
--> statement-breakpoint
CREATE INDEX "issues_search_document_idx" ON "latitude"."issues" USING gin ("search_document");
--> statement-breakpoint
ALTER TABLE "latitude"."issues" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid();
