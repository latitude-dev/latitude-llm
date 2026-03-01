-- Custom SQL migration: Create latitude schema and RLS helper functions
CREATE SCHEMA IF NOT EXISTS "latitude";--> statement-breakpoint

-- Helper function to get current organization ID for RLS policies
CREATE OR REPLACE FUNCTION get_current_organization_id()
RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_organization_id', true), '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;--> statement-breakpoint

-- Helper function to get current user ID for RLS policies
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;