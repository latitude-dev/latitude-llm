-- Slug groundwork for the API-expansion plan; see plans/mcp-oauth-api-expansion.md.
--
-- This migration centralizes every user-derived slug column on
-- `varchar(128)` (matching `SLUG_MAX_LENGTH` in `@domain/shared/slug`) and
-- adds the missing slug columns and uniqueness constraints. Five tables in
-- scope: `issues`, `datasets` (new columns); `saved_searches`,
-- `annotation_queues`, `projects` (existing columns resized).
--
-- Flagger slugs are intentionally untouched — those are typed enum values
-- from a fixed registry, not user-derived. `subscriptions.plan_slug` is a
-- billing-plan identifier, also out of scope.
--
-- Per-table flow:
--   * issues, datasets: 3-step rollout (ADD nullable -> backfill from
--     name with id-suffix tie-breaks for duplicates -> SET NOT NULL +
--     UNIQUE per (organization_id, project_id)).
--   * saved_searches: widen 80 -> 128 (no data risk).
--   * annotation_queues: narrow 140 -> 128. Truncate any over-128 slug
--     to 121 chars + `-{6-char-id}` first to avoid new collisions on the
--     existing UNIQUE.
--   * projects: narrow 256 -> 128. Same truncate-and-tag pattern. Also
--     backfill any pre-existing duplicate slugs (the column was previously
--     unique only by convention) and add a UNIQUE constraint per
--     (organization_id, slug, deleted_at).

-- ----------------------------------------------------------------------------
-- 1.a Add nullable slug columns to issues + datasets
-- ----------------------------------------------------------------------------
ALTER TABLE "latitude"."issues" ADD COLUMN "slug" varchar(128);--> statement-breakpoint
ALTER TABLE "latitude"."datasets" ADD COLUMN "slug" varchar(128);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 1.b Backfill slugs from name (with id-suffix tie-breaks for duplicates)
-- ----------------------------------------------------------------------------
-- Same approach as the annotation-queues migration: derive a base slug from
-- `name`, and when two rows in the same (organization_id, project_id) collapse
-- to the same slug, append a 6-char prefix of the id to one of them so the
-- UNIQUE constraint added below holds. `trim(both '-' from ...)` strips the
-- leading/trailing hyphens that `regexp_replace` may leave when the name
-- starts or ends with non-alphanumeric characters.
UPDATE "latitude"."issues" AS i
SET "slug" = CASE
	WHEN EXISTS (
		SELECT 1 FROM "latitude"."issues" AS other
		WHERE other.organization_id = i.organization_id
			AND other.project_id = i.project_id
			AND other.id <> i.id
			AND lower(regexp_replace(other.name, '[^a-zA-Z0-9]+', '-', 'g')) = lower(regexp_replace(i.name, '[^a-zA-Z0-9]+', '-', 'g'))
	) THEN
		trim(both '-' from lower(substring(regexp_replace(i.name, '[^a-zA-Z0-9]+', '-', 'g'), 1, 121))) || '-' || left(i.id::text, 6)
	ELSE
		trim(both '-' from lower(substring(regexp_replace(i.name, '[^a-zA-Z0-9]+', '-', 'g'), 1, 128)))
END
WHERE "slug" IS NULL;--> statement-breakpoint

UPDATE "latitude"."datasets" AS d
SET "slug" = CASE
	WHEN EXISTS (
		SELECT 1 FROM "latitude"."datasets" AS other
		WHERE other.organization_id = d.organization_id
			AND other.project_id = d.project_id
			AND other.id <> d.id
			AND lower(regexp_replace(other.name, '[^a-zA-Z0-9]+', '-', 'g')) = lower(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g'))
	) THEN
		trim(both '-' from lower(substring(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g'), 1, 121))) || '-' || left(d.id::text, 6)
	ELSE
		trim(both '-' from lower(substring(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g'), 1, 128)))
END
WHERE "slug" IS NULL;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 1.c Promote slug to NOT NULL and install UNIQUE constraints
-- ----------------------------------------------------------------------------
ALTER TABLE "latitude"."issues" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."datasets" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_unique_slug_per_project_idx" UNIQUE("organization_id","project_id","slug");--> statement-breakpoint
ALTER TABLE "latitude"."datasets" ADD CONSTRAINT "datasets_unique_slug_per_project_idx" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","slug","deleted_at");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. Saved searches: widen slug 80 -> 128 (no data risk; pure widening)
-- ----------------------------------------------------------------------------
ALTER TABLE "latitude"."saved_searches" ALTER COLUMN "slug" TYPE varchar(128);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. Annotation queues: narrow slug 140 -> 128
-- ----------------------------------------------------------------------------
-- Pre-narrow truncate: any row whose slug exceeds 128 chars gets its first
-- 121 chars + `-{6-char-id}` (7 char suffix budget). This keeps the row
-- uniquely identifiable after truncation and avoids constraint violations
-- on the existing `annotation_queues_unique_slug_per_project_idx`.
UPDATE "latitude"."annotation_queues"
SET "slug" = trim(both '-' from substring("slug", 1, 121)) || '-' || left("id"::text, 6)
WHERE length("slug") > 128;--> statement-breakpoint

ALTER TABLE "latitude"."annotation_queues" ALTER COLUMN "slug" TYPE varchar(128);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. Projects: narrow slug 256 -> 128, backfill duplicates, add UNIQUE
-- ----------------------------------------------------------------------------
-- 4.a Pre-narrow truncate: any slug > 128 chars gets first 121 + `-{6-char-id}`.
UPDATE "latitude"."projects"
SET "slug" = trim(both '-' from substring("slug", 1, 121)) || '-' || left("id"::text, 6)
WHERE length("slug") > 128;--> statement-breakpoint

ALTER TABLE "latitude"."projects" ALTER COLUMN "slug" TYPE varchar(128);--> statement-breakpoint

-- 4.b Backfill duplicate project slugs. The column was previously
-- constrained only by convention (the create use-case appended `-N`
-- suffixes). Within a duplicate group, the row with the smallest id keeps
-- its original slug; every other row gets a `-{6-char-id}` suffix.
UPDATE "latitude"."projects" AS p
SET "slug" = trim(both '-' from substring(p.slug, 1, 121)) || '-' || left(p.id::text, 6)
WHERE EXISTS (
	SELECT 1 FROM "latitude"."projects" AS other
	WHERE other.organization_id = p.organization_id
		AND other.slug = p.slug
		AND other.deleted_at IS NOT DISTINCT FROM p.deleted_at
		AND other.id < p.id
);--> statement-breakpoint

-- 4.c Add UNIQUE constraint on (organization_id, slug, deleted_at).
ALTER TABLE "latitude"."projects" ADD CONSTRAINT "projects_unique_slug_per_organization_idx" UNIQUE NULLS NOT DISTINCT("organization_id","slug","deleted_at");
