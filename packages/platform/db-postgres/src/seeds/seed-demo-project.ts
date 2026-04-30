import { ApiKeyRepository } from "@domain/api-keys"
import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { SeedScope } from "@domain/shared/seeding"
import { UserRepository } from "@domain/users"
import { Effect, Layer } from "effect"
import type { PostgresClient } from "../client.ts"
import { ApiKeyRepositoryLive } from "../repositories/api-key-repository.ts"
import { MembershipRepositoryLive } from "../repositories/membership-repository.ts"
import { OrganizationRepositoryLive } from "../repositories/organization-repository.ts"
import { ProjectRepositoryLive } from "../repositories/project-repository.ts"
import { UserRepositoryLive } from "../repositories/user-repository.ts"
import { SqlClientLive } from "../sql-client.ts"
import { contentSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"
import type { Repositories, SeedContext } from "./types.ts"

/**
 * Run every per-project ("content") seeder against the supplied scope.
 * Used by the runtime "Create Demo Project" Temporal activity — same
 * code path as `pnpm seed`, just with a fresh-ids `scope` instead of
 * `bootstrapSeedScope`.
 *
 * The caller wires this into a Temporal activity and threads the
 * promise through `Effect.runPromise` at its top level. We don't
 * commit to RLS-bypass scope here because the seeders write across
 * multiple orgs' worth of identifiers via the scope's
 * `organizationId` — caller is responsible for passing an admin
 * `PostgresClient` (e.g. `getAdminPostgresClient()`).
 */
export const seedDemoProjectPostgres = (params: { client: PostgresClient; scope: SeedScope }): Promise<void> => {
  const repositoriesLayer = Layer.mergeAll(
    ApiKeyRepositoryLive,
    MembershipRepositoryLive,
    OrganizationRepositoryLive,
    ProjectRepositoryLive,
    UserRepositoryLive,
  ).pipe(Layer.provideMerge(SqlClientLive(params.client)))

  const buildContext = Effect.gen(function* () {
    const repositories: Repositories = {
      apiKey: yield* ApiKeyRepository,
      membership: yield* MembershipRepository,
      organization: yield* OrganizationRepository,
      project: yield* ProjectRepository,
      user: yield* UserRepository,
    }
    return { db: params.client.db, client: params.client, repositories, scope: params.scope } as SeedContext
  })

  const program = Effect.gen(function* () {
    const ctx = yield* buildContext
    yield* runSeeders(contentSeeders, ctx)
  })

  return Effect.runPromise(program.pipe(Effect.provide(repositoriesLayer)))
}
