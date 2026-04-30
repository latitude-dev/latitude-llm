import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { bootstrapSeedScope } from "@domain/shared/seeding"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { closeClickhouse, createClickhouseClient } from "../client.ts"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const main = async () => {
  const client = createClickhouseClient()

  console.log("Seeding ClickHouse...")

  try {
    await Effect.runPromise(runSeeders(allSeeders, { client, scope: bootstrapSeedScope }))
    console.log("Seed complete.")
  } catch (error) {
    console.error("Seed failed:", error)
    process.exitCode = 1
  } finally {
    await closeClickhouse(client)
  }
}

main()
