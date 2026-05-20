import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { bootstrapSeedScope } from "@domain/shared/seeding"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { closeClickhouse, createClickhouseClient } from "../client.ts"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"
import { truncateDataTables } from "./truncate-data-tables.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

// Defense in depth: the seed truncates every data table on entry, which would
// be catastrophic against prod data. The reset shell scripts also gate on
// NODE_ENV; mirroring that guard here means a careless `pnpm ch:seed` against
// a prod-pointed env still aborts.
if (nodeEnv === "production") {
  console.error("ERROR: ch:seed refuses to run in production")
  process.exit(1)
}

// `--reset` truncates every data table before re-seeding. Default `ch:seed`
// is idempotent per-seeder (no-ops when its sentinel rows already exist) and
// preserves any manually-introduced data. Use --reset to wipe the seed's
// footprint *and* anything else in those tables — the table-level equivalent
// of `pnpm ch:reset` without going through Docker volume removal.
const shouldReset = process.argv.includes("--reset")

const main = async () => {
  const client = createClickhouseClient()

  console.log(`Seeding ClickHouse${shouldReset ? " (--reset: truncate first)" : ""}...`)

  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        if (shouldReset) {
          console.log("- truncating all data tables")
          yield* truncateDataTables(client)
        }
        yield* runSeeders(allSeeders, { client, scope: bootstrapSeedScope })
      }),
    )
    console.log("Seed complete.")
  } catch (error) {
    console.error("Seed failed:", error)
    process.exitCode = 1
  } finally {
    await closeClickhouse(client)
  }
}

main()
