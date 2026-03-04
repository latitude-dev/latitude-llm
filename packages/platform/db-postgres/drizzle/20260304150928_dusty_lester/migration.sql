-- Consolidated migration: Simplified RLS setup
-- Organization, member, and user tables have no RLS (app-level auth only)
-- Only org-scoped tables (projects, api_keys, invitation, grants, subscription) have RLS

-- Ensure RLS is disabled on organization, member, and user tables
-- These rely on application-level authorization
ALTER TABLE "latitude"."organization" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."member" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."user" DISABLE ROW LEVEL SECURITY;

-- Remove FORCE RLS from non-RLS tables
ALTER TABLE "latitude"."organization" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."member" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."user" NO FORCE ROW LEVEL SECURITY;

-- Drop any existing organization policies (clean state)
DROP POLICY IF EXISTS "organization_select_policy" ON "latitude"."organization";
DROP POLICY IF EXISTS "organization_insert_policy" ON "latitude"."organization";
DROP POLICY IF EXISTS "organization_update_delete_policy" ON "latitude"."organization";

-- Drop any existing member policy (clean state)
DROP POLICY IF EXISTS "member_organization_policy" ON "latitude"."member";

-- Ensure RLS is enabled and forced on org-scoped tables only
-- These tables have organization_id columns and use organizationRLSPolicy()
ALTER TABLE "latitude"."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."subscription" ENABLE ROW LEVEL SECURITY;

-- Force RLS on org-scoped tables (prevents owner bypass)
ALTER TABLE "latitude"."projects" FORCE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."api_keys" FORCE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."invitation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."grants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."subscription" FORCE ROW LEVEL SECURITY;
