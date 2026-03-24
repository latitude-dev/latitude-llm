import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { ApiKeyRepository } from "@domain/api-keys"
import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { UserRepository } from "@domain/users"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { Effect, Layer } from "effect"
import { closePostgres, createPostgresClient } from "../client.ts"
import { ApiKeyRepositoryLive } from "../repositories/api-key-repository.ts"
import { MembershipRepositoryLive } from "../repositories/membership-repository.ts"
import { OrganizationRepositoryLive } from "../repositories/organization-repository.ts"
import { ProjectRepositoryLive } from "../repositories/project-repository.ts"
import { UserRepositoryLive } from "../repositories/user-repository.ts"
import { SqlClientLive } from "../sql-client.ts"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"
import type { Repositories, SeedContext } from "./types.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const main = async () => {
  // Seeds need full access to bypass RLS, so use the admin database URL.
  const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
  const client = createPostgresClient({ databaseUrl: adminUrl })

  console.log("Seeding database...")

  try {
    // Build a layer that provides all repositories using SqlClient
    const repositoriesLayer = Layer.mergeAll(
      ApiKeyRepositoryLive,
      MembershipRepositoryLive,
      OrganizationRepositoryLive,
      ProjectRepositoryLive,
      UserRepositoryLive,
    ).pipe(Layer.provide(SqlClientLive(client)))

    // Create the seed context
    const buildContext = Effect.gen(function* () {
      const repositories: Repositories = {
        apiKey: yield* ApiKeyRepository,
        membership: yield* MembershipRepository,
        organization: yield* OrganizationRepository,
        project: yield* ProjectRepository,
        user: yield* UserRepository,
      }
      return { db: client.db, repositories } as SeedContext
    })

    const program = Effect.gen(function* () {
      const ctx = yield* buildContext
      yield* runSeeders(allSeeders, ctx)
    })

    await Effect.runPromise(program.pipe(Effect.provide(repositoriesLayer)))
    console.log("Seed complete.")
  } catch (error) {
    console.error("Seed failed:", error)
    process.exitCode = 1
  } finally {
    await closePostgres(client.pool)
  }
}

main()
