import type { ApiKeyRepository } from "@domain/api-keys"
import type { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import type { ProjectRepository } from "@domain/projects"
import type { SqlClient } from "@domain/shared"
import type { SeedScope } from "@domain/shared/seeding"
import type { UserRepository } from "@domain/users"
import { Data, type Effect } from "effect"
import type { PostgresClient, PostgresDb } from "../client.ts"

export interface Repositories {
  readonly organization: OrganizationRepository["Service"]
  readonly project: ProjectRepository["Service"]
  readonly apiKey: ApiKeyRepository["Service"]
  readonly membership: MembershipRepository["Service"]
  readonly user: UserRepository["Service"]
}

export interface SeedContext {
  readonly db: PostgresDb
  readonly client: PostgresClient
  readonly repositories: Repositories
  /**
   * Per-project seeding context. Each seeder resolves entity ids via
   * `ctx.scope.cuid("...")` etc. so the same seeder body works for both
   * the canonical bootstrap project (`pnpm seed`) and a demo project
   * created at runtime via the backoffice. See {@link SeedScope}.
   */
  readonly scope: SeedScope
}

export class SeedError extends Data.TaggedError("SeedError")<{
  readonly reason: string
  readonly cause?: unknown
}> {}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, unknown, SqlClient>
}
