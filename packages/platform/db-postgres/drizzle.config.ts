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

const url = Effect.runSync(parseEnvOptional("LAT_ADMIN_DATABASE_URL", "string")) ?? ""

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/schema/better-auth.ts",
    "./src/schema/auth-intent.ts",
    "./src/schema/datasets.ts",
    "./src/schema/datasetVersions.ts",
    "./src/schema/projects.ts",
    "./src/schema/scores.ts",
    "./src/schema/api-keys.ts",
    "./src/schema/outbox-events.ts",
  ],
  out: "./drizzle",
  dbCredentials: { url },
})
