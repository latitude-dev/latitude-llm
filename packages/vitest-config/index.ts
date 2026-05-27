import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadDotenv } from "dotenv"
import { defineConfig } from "vitest/config"

// Load .env.test if it exists (for test environment variables)
// First try process.cwd(), then search up to 5 parent directories
const findAndLoadEnvTest = () => {
  const envTestPath = resolve(process.cwd(), ".env.test")
  if (existsSync(envTestPath)) {
    loadDotenv({ path: envTestPath, quiet: true })
    return
  }

  // Try to find .env.test in parent directories (monorepo setup)
  let currentDir = process.cwd()
  for (let i = 0; i < 5; i++) {
    const parentEnvPath = resolve(currentDir, "..", ".env.test")
    if (existsSync(parentEnvPath)) {
      loadDotenv({ path: parentEnvPath, quiet: true })
      return
    }
    currentDir = resolve(currentDir, "..")
  }

  // Last resort: try from this file's location
  const __dirname = fileURLToPath(new URL(".", import.meta.url))
  const fromConfigDir = resolve(__dirname, "..", "..", "..", ".env.test")
  if (existsSync(fromConfigDir)) {
    loadDotenv({ path: fromConfigDir, quiet: true })
  }
}

findAndLoadEnvTest()

/** Headroom for PGlite migrations + chdb session bootstrap/teardown. Kept tight on purpose
 * so genuinely-slow hooks fail fast and get sharded; do not raise as a workaround. */
export const PGLITE_HOOK_TIMEOUT_MS = 30_000

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/coverage/**", "**/.turbo/**"],
    // PGlite migrations + chdb session bootstrapping comfortably exceed the 10s
    // vitest default when many packages run in parallel under turbo. Set the
    // ceiling here so every package using setupTestPostgres / setupTestClickHouse
    // inherits the same headroom without each declaring its own override.
    hookTimeout: PGLITE_HOOK_TIMEOUT_MS,
  },
})
