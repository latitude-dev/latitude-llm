CREATE INDEX IF NOT EXISTS "outbox_events_unpublished_idx" ON "latitude"."outbox_events" USING btree ("created_at") WHERE "published" = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_published_at_idx" ON "latitude"."outbox_events" USING btree ("published_at") WHERE "published" = true;
--> statement-breakpoint
DO $$
DECLARE
  expected record;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('outbox_events_unpublished_idx', 'created_at', '(published = false)'),
      ('outbox_events_published_at_idx', 'published_at', '(published = true)')
    ) AS indexes(name, column_name, predicate)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
      JOIN pg_catalog.pg_am am ON am.oid = c.relam
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      JOIN pg_catalog.pg_opclass op ON op.oid = i.indclass[0]
      JOIN pg_catalog.pg_namespace opn ON opn.oid = op.opcnamespace
      WHERE n.nspname = 'latitude'
        AND c.relname = expected.name
        AND c.relkind = 'i'
        AND i.indrelid = 'latitude.outbox_events'::regclass
        AND am.amname = 'btree'
        AND i.indisvalid AND i.indisready AND i.indislive
        AND NOT i.indisunique
        AND i.indnkeyatts = 1 AND i.indnatts = 1
        AND i.indexprs IS NULL
        AND a.attname = expected.column_name
        AND NOT a.attisdropped
        AND a.atttypid = 'pg_catalog.timestamptz'::regtype
        AND i.indoption[0] = 0
        AND i.indcollation[0] = 0
        AND op.opcmethod = am.oid AND op.opcdefault
        AND op.opcintype = a.atttypid
        AND opn.nspname = 'pg_catalog' AND op.opcname = 'timestamptz_ops'
        AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) = expected.predicate
    ) THEN
      RAISE EXCEPTION 'Outbox index % is missing, invalid, or has an unexpected definition', expected.name;
    END IF;
  END LOOP;
END
$$;
