import type { PostgresDb } from "../client.ts"
import { createApiKeyPostgresRepository } from "./api-key-repository.ts"
import { createGrantPostgresRepository } from "./grant-repository.ts"
import { createMembershipPostgresRepository } from "./membership-repository.ts"
import { createOrganizationPostgresRepository } from "./organization-repository.ts"
import { createProjectPostgresRepository } from "./project-repository.ts"
import { createSubscriptionPostgresRepository } from "./subscription-repository.ts"
import { createUserPostgresRepository } from "./user-repository.ts"

/**
 * Consolidated repository factory.
 *
 * Creates all repositories from a single database connection.
 *
 * Usage:
 * ```typescript
 * const repos = createRepositories(db);
 * // repos.organization.findById(...)
 * // repos.project.findByOrganizationId(...)
 * ```
 */
export interface Repositories {
  organization: ReturnType<typeof createOrganizationPostgresRepository>
  project: ReturnType<typeof createProjectPostgresRepository>
  apiKey: ReturnType<typeof createApiKeyPostgresRepository>
  membership: ReturnType<typeof createMembershipPostgresRepository>
  subscription: ReturnType<typeof createSubscriptionPostgresRepository>
  grant: ReturnType<typeof createGrantPostgresRepository>
  user: ReturnType<typeof createUserPostgresRepository>
}

export const createRepositories = (db: PostgresDb): Repositories => ({
  organization: createOrganizationPostgresRepository(db),
  project: createProjectPostgresRepository(db),
  apiKey: createApiKeyPostgresRepository(db),
  membership: createMembershipPostgresRepository(db),
  subscription: createSubscriptionPostgresRepository(db),
  grant: createGrantPostgresRepository(db),
  user: createUserPostgresRepository(db),
})

export { createApiKeyPostgresRepository } from "./api-key-repository.ts"
export { createGrantPostgresRepository } from "./grant-repository.ts"
export { createMembershipPostgresRepository } from "./membership-repository.ts"
export { createOrganizationPostgresRepository } from "./organization-repository.ts"
export { createProjectPostgresRepository } from "./project-repository.ts"
export { createSubscriptionPostgresRepository } from "./subscription-repository.ts"
export { createUserPostgresRepository } from "./user-repository.ts"
