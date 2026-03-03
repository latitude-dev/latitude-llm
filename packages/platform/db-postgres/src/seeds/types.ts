import { Data, type Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import type { createApiKeyPostgresRepository } from "../repositories/api-key-repository.ts"
import type { createGrantPostgresRepository } from "../repositories/grant-repository.ts"
import type { createMembershipPostgresRepository } from "../repositories/membership-repository.ts"
import type { createOrganizationPostgresRepository } from "../repositories/organization-repository.ts"
import type { createProjectPostgresRepository } from "../repositories/project-repository.ts"
import type { createSubscriptionPostgresRepository } from "../repositories/subscription-repository.ts"
import type { createUserPostgresRepository } from "../repositories/user-repository.ts"

export interface Repositories {
  readonly organization: ReturnType<typeof createOrganizationPostgresRepository>
  readonly project: ReturnType<typeof createProjectPostgresRepository>
  readonly apiKey: ReturnType<typeof createApiKeyPostgresRepository>
  readonly membership: ReturnType<typeof createMembershipPostgresRepository>
  readonly subscription: ReturnType<typeof createSubscriptionPostgresRepository>
  readonly grant: ReturnType<typeof createGrantPostgresRepository>
  readonly user: ReturnType<typeof createUserPostgresRepository>
}

export interface SeedContext {
  readonly db: PostgresDb
  readonly repositories: Repositories
}

export class SeedError extends Data.TaggedError("SeedError")<{
  readonly reason: string
  readonly cause?: unknown
}> {}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, unknown>
}
