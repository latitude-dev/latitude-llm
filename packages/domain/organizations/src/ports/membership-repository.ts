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
  emailVerified: boolean
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
    findByIdWithUser: (id: MembershipId) => Effect.Effect<MemberWithUser, NotFoundError | RepositoryError, SqlClient>
    /**
     * Returns true if the email belongs to a confirmed member of the caller's organization (resolved
     * from the RLS context). Case-insensitive comparison; returns false (not a `NotFoundError`) when
     * no match — callers don't usually need to distinguish "no row" from a failure here.
     */
    findMemberByEmail: (email: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
    isMember: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
    isAdmin: (organizationId: OrganizationId, userId: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
    save: (membership: Membership) => Effect.Effect<void, RepositoryError, SqlClient>
    delete: (id: MembershipId) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/organizations/MembershipRepository") {}
