import { OrganizationId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Data, Effect } from "effect"
import { createAuthIntent } from "../entities/auth-intent.ts"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import { createInviteIntentData, normalizeEmail } from "./auth-intent-policy.ts"

export class InviteAlreadyPendingError extends Data.TaggedError("InviteAlreadyPendingError")<{
  readonly email: string
  readonly organizationId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "User already has a pending invitation to this workspace"
}

export const createInviteIntentUseCase = (input: {
  intentId?: string
  email: string
  organizationId: string
  organizationName: string
  inviterName: string
}) =>
  Effect.gen(function* () {
    const users = yield* UserRepository
    const intents = yield* AuthIntentRepository

    const email = normalizeEmail(input.email)
    const inviteData = createInviteIntentData({
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      inviterName: input.inviterName,
    })
    const pendingInvites = yield* intents.findPendingInvitesByOrganizationId(OrganizationId(input.organizationId))
    const hasPendingInvite = pendingInvites.some((invite) => normalizeEmail(invite.email) === email)

    if (hasPendingInvite) {
      return yield* new InviteAlreadyPendingError({
        email,
        organizationId: input.organizationId,
      })
    }

    const existingUser = yield* users
      .findByEmail(email)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    const intent = createAuthIntent({
      id: input.intentId,
      type: "invite",
      email,
      data: inviteData,
      existingAccountAtRequest: existingUser !== null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    yield* intents.save(intent)

    return intent
  })
