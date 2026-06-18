-- In-place column rename (Phase-1 issue_id→signal_id precedent). Postgres rewrites the index
-- predicates that reference this column automatically. Brief rollover downtime is accepted: the
-- one-shot migration runs before the rolling deploy, so in-flight tasks query the renamed column.
ALTER TABLE "latitude"."scores" RENAME COLUMN "source" TO "source_type";
