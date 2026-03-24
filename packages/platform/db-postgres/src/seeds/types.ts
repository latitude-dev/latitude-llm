import type { ApiKeyRepository } from "@domain/api-keys"
import type { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import type { ProjectRepository } from "@domain/projects"
import type { UserRepository } from "@domain/users"
import { Data, type Effect } from "effect"
import type { PostgresDb } from "../client.ts"

export interface Repositories {
  readonly organization: OrganizationRepository["Service"]
  readonly project: ProjectRepository["Service"]
  readonly apiKey: ApiKeyRepository["Service"]
  readonly membership: MembershipRepository["Service"]
  readonly user: UserRepository["Service"]
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
