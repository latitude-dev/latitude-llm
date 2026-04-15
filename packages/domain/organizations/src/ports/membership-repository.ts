import type { MembershipId, NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Membership } from "../entities/membership.ts"

export interface MemberWithUser {
  id: MembershipId
  organizationId: string
  userId: string
  role: string
  createdAt: Date
  name: string | null
  email: string
  image: string | null
}

// MembershipRepository Service with all methods needed by use cases
export class MembershipRepository extends ServiceMap.Service<
  MembershipRepository,
  {
    findById: (id: MembershipId) => Effect.Effect<Membership, NotFoundError | RepositoryError>
    listByOrganizationId: (organizationId: OrganizationId) => Effect.Effect<Membership[], RepositoryError>
    listByUserId: (userId: string) => Effect.Effect<Membership[], RepositoryError>
    findByOrganizationAndUser: (
      organizationId: OrganizationId,
      userId: string,
    ) => Effect.Effect<Membership, NotFoundError | RepositoryError>
    listMembersWithUser: (organizationId: OrganizationId) => Effect.Effect<MemberWithUser[], RepositoryError>
    isMember: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError>
    isAdmin: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError>
    save: (membership: Membership) => Effect.Effect<void, RepositoryError>
    delete: (id: MembershipId) => Effect.Effect<void, RepositoryError>
  }
>()("@domain/organizations/MembershipRepository") {}
