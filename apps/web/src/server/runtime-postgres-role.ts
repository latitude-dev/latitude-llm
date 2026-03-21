import type { PostgresClient } from "@platform/db-postgres"
import { sql } from "drizzle-orm"

export const isRuntimeAuthError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  if (message.includes("password authentication failed") || message.includes("no pg_hba.conf entry")) {
    return true
  }

  return message.includes("role") && message.includes("does not exist")
}

const getRuntimeDatabaseConfig = (runtimeDatabaseUrl: string) => {
  try {
    const parsed = new URL(runtimeDatabaseUrl)
    const database = parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname
    return {
      role: parsed.username || null,
      password: parsed.password || null,
      database: database || null,
    }
  } catch {
    return null
  }
}

const ensureRuntimeRole = async ({
  tx,
  runtimeRole,
  runtimePassword,
}: {
  tx: Parameters<Parameters<PostgresClient["transaction"]>[0]>[0]
  runtimeRole: string
  runtimePassword: string | null
}) => {
  await tx.execute(sql`
DO $$
DECLARE role_name text := ${runtimeRole};
DECLARE role_password text := ${runtimePassword};
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
    EXECUTE format('CREATE USER %I', role_name);
  END IF;

  IF role_password IS NOT NULL THEN
    EXECUTE format('ALTER USER %I WITH PASSWORD %L', role_name, role_password);
  END IF;
END $$;
`)
}

const grantRuntimeRoleAccess = async ({
  tx,
  runtimeRole,
  databaseName,
}: {
  tx: Parameters<Parameters<PostgresClient["transaction"]>[0]>[0]
  runtimeRole: string
  databaseName: string
}) => {
  await tx.execute(sql`
DO $$
DECLARE role_name text := ${runtimeRole};
DECLARE database_name text := ${databaseName};
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', database_name, role_name);
  EXECUTE format('GRANT USAGE ON SCHEMA latitude TO %I', role_name);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA latitude TO %I', role_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION get_current_organization_id() TO %I', role_name);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA latitude GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    role_name
  );
END $$;
`)
}

export const ensureRuntimePostgresRoleAccess = async ({
  adminClient,
  runtimeDatabaseUrl,
}: {
  adminClient: PostgresClient
  runtimeDatabaseUrl: string
}): Promise<void> => {
  const runtimeDbConfig = getRuntimeDatabaseConfig(runtimeDatabaseUrl)
  if (!runtimeDbConfig) {
    return
  }
  const { role, password, database } = runtimeDbConfig
  if (!role || !database) {
    return
  }

  await adminClient.transaction(async (tx) => {
    await ensureRuntimeRole({
      tx,
      runtimeRole: role,
      runtimePassword: password,
    })
    await grantRuntimeRoleAccess({
      tx,
      runtimeRole: role,
      databaseName: database,
    })
  })
}
