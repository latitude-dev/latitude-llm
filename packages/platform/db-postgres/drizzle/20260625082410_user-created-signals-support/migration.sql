-- Phase 2 / PR3: user-created signals. Additive columns + index changes + one-time data backfills.

-- signals: new columns. `origin` backfills every existing row to 'system' via the column default
-- (all existing signals are discovery-born). `centroid`/`clustered_at` relax to nullable (user-created
-- evaluation-backed signals have none).
ALTER TABLE "latitude"."signals" ADD COLUMN "origin" varchar(16) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."signals" ADD COLUMN "filters" jsonb;--> statement-breakpoint
ALTER TABLE "latitude"."signals" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "latitude"."signals" ALTER COLUMN "centroid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."signals" ALTER COLUMN "clustered_at" DROP NOT NULL;--> statement-breakpoint

-- signals: soft-delete-aware slug uniqueness (a deleted signal frees its slug for reuse).
ALTER TABLE "latitude"."signals" DROP CONSTRAINT "signals_unique_slug_per_project_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "signals_unique_slug_per_project_idx" ON "latitude"."signals" ("organization_id","project_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- signals: the centroid-embedding CHECK kept its `issues_` name through Phase 1's table rename
-- (untracked by Drizzle). Align it. Behavior is unchanged: a NULL centroid_embedding (every
-- user-created signal) trivially satisfies the CASE, so a nullable centroid needs no edit here.
ALTER TABLE "latitude"."signals" RENAME CONSTRAINT "issues_centroid_embedding_consistency_check" TO "signals_centroid_embedding_consistency_check";--> statement-breakpoint

-- evaluations: new columns; `alignment`/`aligned_at` relax to nullable (set only for aligned judge scripts).
ALTER TABLE "latitude"."evaluations" ADD COLUMN "settings" jsonb;--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "script_hash" text;--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ALTER COLUMN "alignment" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ALTER COLUMN "aligned_at" DROP NOT NULL;--> statement-breakpoint

-- evaluations: backfill script_hash from the hash previously embedded in the alignment jsonb, so the
-- writer can read evaluations.script_hash instead of the now-nullable alignment.evaluationHash.
UPDATE "latitude"."evaluations" SET "script_hash" = "alignment"->>'evaluationHash' WHERE "script_hash" IS NULL AND "alignment" IS NOT NULL;--> statement-breakpoint

-- evaluations: enforce one ACTIVE detector per signal. Today multiple active evaluations may share a
-- signal; dedupe BEFORE creating the unique index by archiving all but the most-recently-aligned per
-- signal (archived predecessors are kept for lineage).
UPDATE "latitude"."evaluations" e
SET "archived_at" = now()
FROM (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, project_id, signal_id
    ORDER BY aligned_at DESC NULLS LAST, created_at DESC
  ) AS rn
  FROM "latitude"."evaluations"
  WHERE deleted_at IS NULL AND archived_at IS NULL
) ranked
WHERE e.id = ranked.id AND ranked.rn > 1;--> statement-breakpoint

CREATE UNIQUE INDEX "evaluations_active_detector_idx" ON "latitude"."evaluations" ("signal_id") WHERE "deleted_at" IS NULL AND "archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "evaluations_active_detector_lookup_idx" ON "latitude"."evaluations" ("organization_id","project_id","signal_id") WHERE "deleted_at" IS NULL AND "archived_at" IS NULL;
