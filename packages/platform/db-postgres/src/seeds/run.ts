import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { closePostgres, createPostgresClient } from "../client.ts"
import { createRepositories } from "../repositories/index.ts"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const main = async () => {
  const { pool, db } = createPostgresClient()
  const repositories = createRepositories(db)

  console.log("Seeding database...\n")

  try {
    await Effect.runPromise(runSeeders(allSeeders, { db, repositories }))
    console.log("\nDone.")
  } catch (error) {
    console.error("\nSeed failed:", error)
    process.exitCode = 1
  } finally {
    await closePostgres(pool)
  }
}

main()
