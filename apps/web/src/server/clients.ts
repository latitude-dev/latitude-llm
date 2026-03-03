import { createBetterAuth } from "@platform/auth-better"
import { type PostgresClient, type PostgresDb, createPostgresClient } from "@platform/db-postgres"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined

export const getPostgresClient = (): { db: PostgresDb; pool: PostgresClient["pool"] } => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }

  const postgresClient = postgresClientInstance

  if (!postgresClient) {
    throw new Error("Postgres client is not initialized")
  }

  return postgresClient
}

export const getBetterAuth = () => {
  if (!betterAuthInstance) {
    const { db } = getPostgresClient()

    const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
    const baseUrl = Effect.runSync(parseEnvOptional("LAT_BETTER_AUTH_URL", "string")) ?? webUrl
    const betterAuthSecret = Effect.runSync(parseEnv("LAT_BETTER_AUTH_SECRET", "string"))

    const trustedOriginsEnv = Effect.runSync(parseEnvOptional("LAT_TRUSTED_ORIGINS", "string"))
    const trustedOrigins = trustedOriginsEnv
      ? trustedOriginsEnv
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : [webUrl]

    betterAuthInstance = createBetterAuth({
      db,
      secret: betterAuthSecret,
      baseUrl,
      trustedOrigins,
      enableTanStackCookies: true,
    })
  }

  const betterAuth = betterAuthInstance

  if (!betterAuth) {
    throw new Error("Better Auth is not initialized")
  }

  return betterAuth
}
