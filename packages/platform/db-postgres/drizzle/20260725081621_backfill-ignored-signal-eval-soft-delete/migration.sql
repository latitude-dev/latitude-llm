-- Soft-delete evaluations linked to ignored signals to match applySignalLifecycleCommand("ignore").
UPDATE "latitude"."evaluations"
SET "deleted_at" = NOW(), "updated_at" = NOW()
WHERE "deleted_at" IS NULL
  AND "signal_id" IN (
    SELECT "id"
    FROM "latitude"."signals"
    WHERE "ignored_at" IS NOT NULL
      AND "deleted_at" IS NULL
  );
