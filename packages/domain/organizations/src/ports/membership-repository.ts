import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Membership } from "../entities/membership.ts"

export interface MemberWithUser {
  id: string
  organizationId: string
  userId: string
  role: string
  createdAt: Date
  name: string | null
  email: string
}

// MembershipRepository Service with all methods needed by use cases
export class MembershipRepository extends ServiceMap.Service<
  MembershipRepository,
  {
    findById: (id: string) => Effect.Effect<Membership, NotFoundError | RepositoryError>
    findByOrganizationId: (organizationId: OrganizationId) => Effect.Effect<Membership[], RepositoryError>
    findByUserId: (userId: string) => Effect.Effect<Membership[], RepositoryError>
    findByOrganizationAndUser: (
      organizationId: OrganizationId,
      userId: string,
    ) => Effect.Effect<Membership, NotFoundError | RepositoryError>
    findMembersWithUser: (organizationId: OrganizationId) => Effect.Effect<MemberWithUser[], RepositoryError>
    isMember: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError>
    isAdmin: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError>
    save: (membership: Membership) => Effect.Effect<void, RepositoryError>
    delete: (id: string) => Effect.Effect<void, RepositoryError>
  }
>()("@domain/organizations/MembershipRepository") {}
