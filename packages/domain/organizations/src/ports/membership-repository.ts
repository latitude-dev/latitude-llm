import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Membership } from "../entities/membership.ts"

export interface MemberWithUser {
  readonly id: string
  readonly organizationId: string
  readonly userId: string
  readonly role: string
  readonly name: string | null
  readonly email: string
  readonly createdAt: Date
}

export class MembershipRepository extends ServiceMap.Service<
  MembershipRepository,
  {
    findById(id: string): Effect.Effect<Membership, NotFoundError | RepositoryError>
    findByOrganizationId(organizationId: OrganizationId): Effect.Effect<readonly Membership[], RepositoryError>
    findByUserId(userId: string): Effect.Effect<readonly Membership[], RepositoryError>
    findByOrganizationAndUser(
      organizationId: OrganizationId,
      userId: string,
    ): Effect.Effect<Membership, NotFoundError | RepositoryError>
    findMembersWithUser(organizationId: OrganizationId): Effect.Effect<readonly MemberWithUser[], RepositoryError>
    isMember(organizationId: OrganizationId, userId: string): Effect.Effect<boolean, RepositoryError>
    isAdmin(organizationId: OrganizationId, userId: string): Effect.Effect<boolean, RepositoryError>
    save(membership: Membership): Effect.Effect<void, RepositoryError>
    delete(id: string): Effect.Effect<void, RepositoryError>
  }
>()("@domain/organizations/MembershipRepository") {}
