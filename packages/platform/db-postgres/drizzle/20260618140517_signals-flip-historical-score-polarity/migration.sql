-- Signals cutover: a signal's occurrences are now its matching scores (passed = true = the behavior
-- is present in the trace). Existing evaluation + annotation scores were written under the old
-- problem-detector polarity (passed = false = exhibits), so flip them once. Errored rows are left
-- alone: errored is never an occurrence, and the score entity forbids passed = true on an errored
-- row, so flipping one would make it fail validation on read.
-- One-time data migration; the `evaluation` value is unchanged (source_type is just renamed).
UPDATE "latitude"."scores"
SET "passed" = NOT "passed"
WHERE "source_type" IN ('evaluation', 'annotation')
  AND "errored" = false;
