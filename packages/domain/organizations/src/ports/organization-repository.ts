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
    existsBySlug: (slug: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
  }
>()("@domain/organizations/OrganizationRepository") {}
