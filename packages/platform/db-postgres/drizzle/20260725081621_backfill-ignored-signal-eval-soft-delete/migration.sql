-- The muted→ignored backfill (20260720152609) stamped ignored_at but did not archive linked
-- evaluations the way applySignalLifecycleCommand("ignore") does via softDeleteBySignalId.
UPDATE "latitude"."evaluations"
SET "deleted_at" = NOW(), "updated_at" = NOW()
WHERE "deleted_at" IS NULL
  AND "signal_id" IN (
    SELECT "id"
    FROM "latitude"."signals"
    WHERE "ignored_at" IS NOT NULL
      AND "deleted_at" IS NULL
  );
