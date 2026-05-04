import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { defineConfig } from "drizzle-kit"
import { Effect } from "effect"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const url = Effect.runSync(parseEnvOptional("LAT_ADMIN_DATABASE_URL", "string"))?.trim() ?? ""

if (!url) {
  throw new Error(
    [
      "drizzle.config.ts: LAT_ADMIN_DATABASE_URL is missing or empty.",
      existsSync(envFilePath)
        ? `Loaded env from ${envFilePath} but the variable was not set (or was blank).`
        : `Expected ${envFilePath} (from NODE_ENV=${nodeEnv}) with LAT_ADMIN_DATABASE_URL; file missing.`,
      "Use the admin Postgres URL from .env.example (owner `latitude`), not LAT_DATABASE_URL / `latitude_app` — the runtime user cannot CREATE SCHEMA for Drizzle's migration journal.",
    ].join(" "),
  )
}

function urlUsername(connectionUrl: string): string | undefined {
  try {
    return new URL(connectionUrl).username || undefined
  } catch {
    // Malformed URL: do not assert here; let drizzle-kit / pg surface the error.
    return undefined
  }
}

if (urlUsername(url) === "latitude_app") {
  throw new Error(
    "drizzle.config.ts: LAT_ADMIN_DATABASE_URL points at user `latitude_app` (RLS runtime). " +
      "Use the admin URL with user `latitude` for drizzle-kit migrate / pg:migrate (see .env.example).",
  )
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/*.ts",
  out: "./drizzle",
  dbCredentials: { url },
})
