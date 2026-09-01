DROP INDEX "latitude"."signals_unique_slug_per_project_idx";--> statement-breakpoint
-- Signal slugs become organization-unique (spanning projects) instead of project-unique.
-- Any pre-existing cross-project collision (two projects of one org sharing a slug) would
-- fail the CREATE UNIQUE INDEX below, so first regenerate every colliding row but the oldest:
-- keep the 3-char prefix and draw a fresh letter-first 4-char suffix until it is free org-wide,
-- matching the shape and uniqueness contract of generateSignalSlug.
DO $$
DECLARE
  dup RECORD;
  prefix text;
  candidate text;
  first_alphabet CONSTANT text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  rest_alphabet CONSTANT text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  attempts int;
BEGIN
  FOR dup IN
    SELECT id, organization_id, slug
    FROM (
      SELECT id, organization_id, slug,
        row_number() OVER (PARTITION BY organization_id, slug ORDER BY created_at, id) AS rn
      FROM "latitude"."signals"
      WHERE deleted_at IS NULL
    ) ranked
    WHERE ranked.rn > 1
  LOOP
    prefix := substring(dup.slug FROM 1 FOR 3);
    attempts := 0;
    LOOP
      candidate := prefix || '-'
        || substr(first_alphabet, 1 + floor(random() * 26)::int, 1)
        || substr(rest_alphabet, 1 + floor(random() * 36)::int, 1)
        || substr(rest_alphabet, 1 + floor(random() * 36)::int, 1)
        || substr(rest_alphabet, 1 + floor(random() * 36)::int, 1);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "latitude"."signals"
        WHERE organization_id = dup.organization_id AND slug = candidate AND deleted_at IS NULL
      );
      attempts := attempts + 1;
      IF attempts > 10 THEN
        RAISE EXCEPTION 'could not regenerate a unique signal slug for %', dup.id;
      END IF;
    END LOOP;
    UPDATE "latitude"."signals" SET slug = candidate, updated_at = now() WHERE id = dup.id;
  END LOOP;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "signals_unique_slug_per_org_idx" ON "latitude"."signals" ("organization_id","slug") WHERE "deleted_at" IS NULL;
