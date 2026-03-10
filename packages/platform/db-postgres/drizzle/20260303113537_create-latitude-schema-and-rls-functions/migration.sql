CREATE SCHEMA IF NOT EXISTS latitude;--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_current_organization_id() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_organization_id', true), '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
