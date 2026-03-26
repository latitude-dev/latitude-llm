import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { config as loadDotenv } from "dotenv"

/**
 * Loads the `.env.<NODE_ENV>` file for local development.
 * Skipped silently in production containers where the file won't exist.
 *
 * Pass `import.meta.url` from the calling module so the path is resolved
 * relative to that file (typically `apps/<name>/src/server.ts`, three levels
 * above the monorepo root `.env.*` files).
 */
export function loadDevelopmentEnvironments(importMetaUrl: string) {
  const nodeEnv = process.env.NODE_ENV ?? "development"
  const envFile = `.env.${nodeEnv}`

  const envPath = fileURLToPath(new URL(`../../../${envFile}`, importMetaUrl))
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, quiet: true })
  }

  return { nodeEnv }
}
