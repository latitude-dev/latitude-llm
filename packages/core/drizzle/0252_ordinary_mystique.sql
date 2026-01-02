-- Custom SQL migration file, put your code below! --

-- Create mcp_oauth_credentials table for storing OAuth tokens for MCP integrations
CREATE TABLE IF NOT EXISTS "latitude"."mcp_oauth_credentials" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "workspace_id" bigint NOT NULL REFERENCES "latitude"."workspaces"("id") ON DELETE CASCADE,
  "integration_id" bigint NOT NULL UNIQUE REFERENCES "latitude"."integrations"("id") ON DELETE CASCADE,
  "client_id" text,
  "client_secret" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp,
  "code_verifier" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create index on workspace_id for faster lookups
CREATE INDEX IF NOT EXISTS "mcp_oauth_credentials_workspace_id_idx" ON "latitude"."mcp_oauth_credentials" ("workspace_id");

-- Create index on integration_id for faster lookups
CREATE INDEX IF NOT EXISTS "mcp_oauth_credentials_integration_id_idx" ON "latitude"."mcp_oauth_credentials" ("integration_id");