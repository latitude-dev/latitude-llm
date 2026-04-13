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

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/coverage/**", "**/.turbo/**"],
  },
})
