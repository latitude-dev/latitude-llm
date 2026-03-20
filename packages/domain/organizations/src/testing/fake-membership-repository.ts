import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Membership } from "../entities/membership.ts"
import type { MembershipRepository } from "../ports/membership-repository.ts"

type MembershipRepositoryShape = (typeof MembershipRepository)["Service"]

export const createFakeMembershipRepository = (overrides?: Partial<MembershipRepositoryShape>) => {
  const memberships = new Map<string, Membership>()

  const repository: MembershipRepositoryShape = {
    findById: (id) => {
      const m = memberships.get(id)
      if (!m) return Effect.fail(new NotFoundError({ entity: "Membership", id }))
      return Effect.succeed(m)
    },

    findByOrganizationId: (organizationId) =>
      Effect.succeed([...memberships.values()].filter((m) => m.organizationId === organizationId)),

    findByUserId: (userId) => Effect.succeed([...memberships.values()].filter((m) => m.userId === userId)),

    findByOrganizationAndUser: (organizationId, userId) => {
      const m = [...memberships.values()].find((m) => m.organizationId === organizationId && m.userId === userId)
      if (!m) return Effect.fail(new NotFoundError({ entity: "Membership", id: "" }))
      return Effect.succeed(m)
    },

    findMembersWithUser: () => Effect.succeed([]),

    isMember: (organizationId, userId) =>
      Effect.succeed([...memberships.values()].some((m) => m.organizationId === organizationId && m.userId === userId)),

    isAdmin: () => Effect.succeed(false),

    save: (membership) =>
      Effect.sync(() => {
        memberships.set(membership.id, membership)
      }),

    delete: (id) =>
      Effect.sync(() => {
        memberships.delete(id)
      }),
    ...overrides,
  }

  return { repository, memberships }
}
