import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { OrganizationId } from "@domain/shared"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { closePostgres, createPostgresClient } from "../client.ts"
import {
  createApiKeyPostgresRepository,
  createGrantPostgresRepository,
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  createProjectPostgresRepository,
  createSubscriptionPostgresRepository,
  createUserPostgresRepository,
} from "../repositories/index.ts"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const main = async () => {
  const { pool, db } = createPostgresClient()
  const systemOrgId = OrganizationId("000000000000000000000000") // Placeholder for seeders
  const repositories = {
    apiKey: createApiKeyPostgresRepository(db, systemOrgId),
    grant: createGrantPostgresRepository(db, systemOrgId),
    membership: createMembershipPostgresRepository(db),
    organization: createOrganizationPostgresRepository(db),
    project: createProjectPostgresRepository(db, systemOrgId),
    subscription: createSubscriptionPostgresRepository(db, systemOrgId),
    user: createUserPostgresRepository(db),
  }

  console.log("Seeding database...")

  try {
    await Effect.runPromise(runSeeders(allSeeders, { db, repositories }))
    console.log("Seed complete.")
  } catch (error) {
    console.error("Seed failed:", error)
    process.exitCode = 1
  } finally {
    await closePostgres(pool)
  }
}

main()
