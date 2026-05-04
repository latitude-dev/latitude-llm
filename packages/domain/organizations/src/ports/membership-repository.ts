import type { MembershipId, NotFoundError, OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
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
export class MembershipRepository extends Context.Service<
  MembershipRepository,
  {
    findById: (id: MembershipId) => Effect.Effect<Membership, NotFoundError | RepositoryError, SqlClient>
    listByOrganizationId: (organizationId: OrganizationId) => Effect.Effect<Membership[], RepositoryError, SqlClient>
    listByUserId: (userId: string) => Effect.Effect<Membership[], RepositoryError, SqlClient>
    findByOrganizationAndUser: (
      organizationId: OrganizationId,
      userId: string,
    ) => Effect.Effect<Membership, NotFoundError | RepositoryError, SqlClient>
    listMembersWithUser: (organizationId: OrganizationId) => Effect.Effect<MemberWithUser[], RepositoryError, SqlClient>
    isMember: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
    isAdmin: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
    save: (membership: Membership) => Effect.Effect<void, RepositoryError, SqlClient>
    delete: (id: MembershipId) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/organizations/MembershipRepository") {}
