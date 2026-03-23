import type { NotFoundError, OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Organization } from "../entities/organization.ts"

export class OrganizationRepository extends ServiceMap.Service<
  OrganizationRepository,
  {
    findById: (id: OrganizationId) => Effect.Effect<Organization, NotFoundError | RepositoryError>
    findByUserId: (userId: UserId) => Effect.Effect<Organization[], RepositoryError>
    save: (org: Organization) => Effect.Effect<void, RepositoryError>
    delete: (id: OrganizationId) => Effect.Effect<void, RepositoryError>
    existsBySlug: (slug: string) => Effect.Effect<boolean, RepositoryError>
  }
>()("@domain/organizations/OrganizationRepository") {}
