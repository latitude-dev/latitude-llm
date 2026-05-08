import type { NotFoundError, OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Organization } from "../entities/organization.ts"

export class OrganizationRepository extends Context.Service<
  OrganizationRepository,
  {
    findById: (id: OrganizationId) => Effect.Effect<Organization, NotFoundError | RepositoryError, SqlClient>
    listByUserId: (userId: UserId) => Effect.Effect<Organization[], RepositoryError, SqlClient>
    save: (org: Organization) => Effect.Effect<void, RepositoryError, SqlClient>
    delete: (id: OrganizationId) => Effect.Effect<void, RepositoryError, SqlClient>
    /**
     * Number of organizations with this slug. Powers the `count` callback of
     * `generateSlug`. The DB has a global UNIQUE constraint so the result is
     * always 0 or 1, but the count shape keeps the contract uniform with the
     * other entities.
     */
    countBySlug: (slug: string) => Effect.Effect<number, RepositoryError, SqlClient>
  }
>()("@domain/organizations/OrganizationRepository") {}
