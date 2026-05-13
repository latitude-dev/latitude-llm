import { type InvitationId, NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Invitation } from "../entities/invitation.ts"
import type { InvitationRepository } from "../ports/invitation-repository.ts"

type InvitationRepositoryShape = (typeof InvitationRepository)["Service"]

export const createFakeInvitationRepository = (overrides?: Partial<InvitationRepositoryShape>) => {
  const invitations = new Map<InvitationId, Invitation>()

  const repository: InvitationRepositoryShape = {
    findPublicPendingPreviewById: (id) => Effect.fail(new NotFoundError({ entity: "Invitation", id })),

    listPending: () =>
      Effect.succeed(
        [...invitations.values()]
          .filter((i) => i.status === "pending")
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),

    findById: (id) => {
      const invitation = invitations.get(id)
      if (!invitation) return Effect.fail(new NotFoundError({ entity: "Invitation", id }))
      return Effect.succeed(invitation)
    },

    create: (invitation) =>
      Effect.sync(() => {
        invitations.set(invitation.id, invitation)
      }),

    setStatus: (id, status) =>
      Effect.sync(() => {
        const invitation = invitations.get(id)
        if (invitation) invitations.set(id, { ...invitation, status })
      }),

    ...overrides,
  }

  return { repository, invitations }
}
