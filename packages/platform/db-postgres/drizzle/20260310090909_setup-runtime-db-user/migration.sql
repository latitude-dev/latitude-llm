-- Grant the runtime user access to the latitude schema and all tables.
-- The runtime user (latitude_app) is subject to RLS; the migration user (latitude) bypasses it.
-- We intentionally do not guard this with IF EXISTS so setup fails loudly if
-- the runtime user is missing.
GRANT USAGE ON SCHEMA latitude TO latitude_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA latitude TO latitude_app;
GRANT EXECUTE ON FUNCTION get_current_organization_id() TO latitude_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA latitude GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO latitude_app;
