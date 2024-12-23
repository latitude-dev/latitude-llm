ALTER TABLE "latitude"."projects" ADD COLUMN "last_edited_at" timestamp DEFAULT now() NOT NULL;

UPDATE "latitude"."projects" p
SET "last_edited_at" = metadata.max_updated_at
FROM (
    SELECT 
        c.project_id,
        MAX(dv.updated_at) AS max_updated_at
    FROM "latitude"."commits" c
    JOIN "latitude"."document_versions" dv
        ON c.id = dv.commit_id
    GROUP BY c.project_id
) metadata
WHERE p.id = metadata.project_id;