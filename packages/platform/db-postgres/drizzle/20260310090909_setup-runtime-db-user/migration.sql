-- Grant the runtime user access to the latitude schema and all tables.
-- The runtime user (latitude_app) is subject to RLS; the migration user (latitude) bypasses it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'latitude_app') THEN
    GRANT USAGE ON SCHEMA latitude TO latitude_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA latitude TO latitude_app;
    GRANT EXECUTE ON FUNCTION get_current_organization_id() TO latitude_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA latitude GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO latitude_app;
  END IF;
END $$;
