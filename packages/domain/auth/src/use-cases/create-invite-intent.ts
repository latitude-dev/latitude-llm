import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import { createAuthIntent } from "../entities/auth-intent.ts"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import { createInviteIntentData, normalizeEmail } from "./auth-intent-policy.ts"

export const createInviteIntentUseCase = (input: {
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
    const existingUser = yield* users
      .findByEmail(email)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    const intent = createAuthIntent({
      type: "invite",
      email,
      data: inviteData,
      existingAccountAtRequest: existingUser !== null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    yield* intents.save(intent)

    return intent
  })
