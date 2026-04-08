import type { NotFoundError, OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"
import type { Organization } from "../entities/organization.ts"

export class OrganizationRepository extends EffectService<
  OrganizationRepository,
  {
    findById: (id: OrganizationId) => Effect.Effect<Organization, NotFoundError | RepositoryError>
    listByUserId: (userId: UserId) => Effect.Effect<Organization[], RepositoryError>
    save: (org: Organization) => Effect.Effect<void, RepositoryError>
    delete: (id: OrganizationId) => Effect.Effect<void, RepositoryError>
    existsBySlug: (slug: string) => Effect.Effect<boolean, RepositoryError>
  }
>()("@domain/organizations/OrganizationRepository") {}
