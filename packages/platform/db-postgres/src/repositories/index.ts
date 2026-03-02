import type { PostgresDb } from "../client.js";
import { createApiKeyPostgresRepository } from "./api-key-repository.js";
import { createGrantPostgresRepository } from "./grant-repository.js";
import { createMembershipPostgresRepository } from "./membership-repository.js";
import { createOrganizationPostgresRepository } from "./organization-repository.js";
import { createProjectPostgresRepository } from "./project-repository.js";
import { createSubscriptionPostgresRepository } from "./subscription-repository.js";
import { createUserPostgresRepository } from "./user-repository.js";

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
  organization: ReturnType<typeof createOrganizationPostgresRepository>;
  project: ReturnType<typeof createProjectPostgresRepository>;
  apiKey: ReturnType<typeof createApiKeyPostgresRepository>;
  membership: ReturnType<typeof createMembershipPostgresRepository>;
  subscription: ReturnType<typeof createSubscriptionPostgresRepository>;
  grant: ReturnType<typeof createGrantPostgresRepository>;
  user: ReturnType<typeof createUserPostgresRepository>;
}

export const createRepositories = (db: PostgresDb): Repositories => ({
  organization: createOrganizationPostgresRepository(db),
  project: createProjectPostgresRepository(db),
  apiKey: createApiKeyPostgresRepository(db),
  membership: createMembershipPostgresRepository(db),
  subscription: createSubscriptionPostgresRepository(db),
  grant: createGrantPostgresRepository(db),
  user: createUserPostgresRepository(db),
});

export { createApiKeyPostgresRepository } from "./api-key-repository.js";
export { createGrantPostgresRepository } from "./grant-repository.js";
export { createMembershipPostgresRepository } from "./membership-repository.js";
export { createOrganizationPostgresRepository } from "./organization-repository.js";
export { createProjectPostgresRepository } from "./project-repository.js";
export { createSubscriptionPostgresRepository } from "./subscription-repository.js";
export { createUserPostgresRepository } from "./user-repository.js";
