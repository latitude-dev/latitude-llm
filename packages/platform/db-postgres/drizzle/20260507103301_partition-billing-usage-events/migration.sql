ALTER TABLE "latitude"."billing_usage_events" RENAME TO "billing_usage_events_legacy";
--> statement-breakpoint
ALTER INDEX IF EXISTS "latitude"."billing_usage_events_pkey" RENAME TO "billing_usage_events_legacy_pkey";
--> statement-breakpoint
ALTER INDEX IF EXISTS "latitude"."billing_usage_events_idempotency_key_unique" RENAME TO "billing_usage_events_legacy_idempotency_key_unique";
--> statement-breakpoint
ALTER INDEX IF EXISTS "latitude"."billing_usage_events_org_happened_at_idx" RENAME TO "billing_usage_events_legacy_org_happened_at_idx";
--> statement-breakpoint
CREATE TABLE "latitude"."billing_usage_events" (
	"id" varchar(24) NOT NULL,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"action" text NOT NULL,
	"credits" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"trace_id" varchar(32),
	"metadata" text,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"billing_period_start" timestamp with time zone NOT NULL,
	"billing_period_end" timestamp with time zone NOT NULL,
	CONSTRAINT "billing_usage_events_pkey" PRIMARY KEY ("id", "billing_period_start")
) PARTITION BY RANGE ("billing_period_start");
--> statement-breakpoint
ALTER TABLE "latitude"."billing_usage_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_usage_events_period_idempotency_key_idx" ON "latitude"."billing_usage_events" ("billing_period_start", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "billing_usage_events_org_happened_at_idx" ON "latitude"."billing_usage_events" ("organization_id", "happened_at");
--> statement-breakpoint
CREATE INDEX "billing_usage_events_idempotency_key_idx" ON "latitude"."billing_usage_events" ("idempotency_key");
--> statement-breakpoint
CREATE POLICY "billing_usage_events_organization_policy" ON "latitude"."billing_usage_events" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "latitude"."create_billing_usage_events_partition"("partition_start" date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = latitude, pg_temp
AS $$
DECLARE
  start_date date := date_trunc('month', partition_start)::date;
  end_date date := (date_trunc('month', partition_start) + interval '1 month')::date;
  start_at text := to_char(start_date, 'YYYY-MM-DD') || ' 00:00:00+00';
  end_at text := to_char(end_date, 'YYYY-MM-DD') || ' 00:00:00+00';
  partition_name text := 'billing_usage_events_' || to_char(date_trunc('month', partition_start), 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS latitude.%I PARTITION OF latitude.billing_usage_events FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    start_at,
    end_at
  );
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "latitude"."ensure_billing_usage_events_partitions"("months_back" integer DEFAULT 2, "months_ahead" integer DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = latitude, pg_temp
AS $$
DECLARE
  cursor_month date := (date_trunc('month', now() AT TIME ZONE 'UTC') - ((months_back::text || ' months')::interval))::date;
  last_month date := (date_trunc('month', now() AT TIME ZONE 'UTC') + ((months_ahead::text || ' months')::interval))::date;
BEGIN
  WHILE cursor_month <= last_month LOOP
    PERFORM latitude.create_billing_usage_events_partition(cursor_month);
    cursor_month := (cursor_month + interval '1 month')::date;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "latitude"."drop_old_billing_usage_events_partitions"("retention_days" integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = latitude, pg_temp
AS $$
DECLARE
  cutoff timestamp with time zone := now() - ((retention_days::text || ' days')::interval);
  child record;
  partition_month date;
  partition_end timestamp with time zone;
  dropped_count integer := 0;
BEGIN
  FOR child IN
    SELECT child_class.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class parent_class ON pg_inherits.inhparent = parent_class.oid
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent_class.relnamespace
    JOIN pg_class child_class ON pg_inherits.inhrelid = child_class.oid
    WHERE parent_namespace.nspname = 'latitude'
      AND parent_class.relname = 'billing_usage_events'
      AND child_class.relname ~ '^billing_usage_events_[0-9]{4}_[0-9]{2}$'
  LOOP
    partition_month := to_date(substring(child.partition_name from '([0-9]{4}_[0-9]{2})$'), 'YYYY_MM');
    partition_end := ((partition_month + interval '1 month')::timestamp AT TIME ZONE 'UTC');

    IF partition_end <= cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS latitude.%I', child.partition_name);
      dropped_count := dropped_count + 1;
    END IF;
  END LOOP;

  RETURN dropped_count;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "latitude"."maintain_billing_usage_events_retention"("retention_days" integer DEFAULT 60, "months_ahead" integer DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = latitude, pg_temp
AS $$
BEGIN
  PERFORM latitude.ensure_billing_usage_events_partitions(2, months_ahead);
  PERFORM latitude.drop_old_billing_usage_events_partitions(retention_days);
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  min_month date;
  max_month date;
  cursor_month date;
BEGIN
  SELECT date_trunc('month', COALESCE(min(billing_period_start), now()) AT TIME ZONE 'UTC')::date INTO min_month
  FROM latitude.billing_usage_events_legacy;

  SELECT date_trunc('month', COALESCE(max(billing_period_start), now()) AT TIME ZONE 'UTC')::date INTO max_month
  FROM latitude.billing_usage_events_legacy;

  min_month := LEAST(min_month, (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '2 months')::date);
  max_month := GREATEST(max_month, (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '3 months')::date);
  cursor_month := min_month;

  WHILE cursor_month <= max_month LOOP
    PERFORM latitude.create_billing_usage_events_partition(cursor_month);
    cursor_month := (cursor_month + interval '1 month')::date;
  END LOOP;
END $$;
--> statement-breakpoint
INSERT INTO "latitude"."billing_usage_events" (
	"id",
	"organization_id",
	"project_id",
	"action",
	"credits",
	"idempotency_key",
	"trace_id",
	"metadata",
	"happened_at",
	"billing_period_start",
	"billing_period_end"
)
SELECT
	"id",
	"organization_id",
	"project_id",
	"action",
	"credits",
	"idempotency_key",
	"trace_id",
	"metadata",
	"happened_at",
	"billing_period_start",
	"billing_period_end"
FROM "latitude"."billing_usage_events_legacy";
--> statement-breakpoint
DROP TABLE "latitude"."billing_usage_events_legacy";
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'latitude_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "latitude"."billing_usage_events" TO latitude_app;
    GRANT EXECUTE ON FUNCTION "latitude"."create_billing_usage_events_partition"(date) TO latitude_app;
    GRANT EXECUTE ON FUNCTION "latitude"."ensure_billing_usage_events_partitions"(integer, integer) TO latitude_app;
    GRANT EXECUTE ON FUNCTION "latitude"."drop_old_billing_usage_events_partitions"(integer) TO latitude_app;
    GRANT EXECUTE ON FUNCTION "latitude"."maintain_billing_usage_events_retention"(integer, integer) TO latitude_app;
  END IF;
END $$;
