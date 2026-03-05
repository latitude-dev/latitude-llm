import { generateId } from "@domain/shared"
import { Effect } from "effect"
import type { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthUserRepository } from "../ports/auth-user-repository.ts"
import type { AuthIntent } from "../types.ts"
import { createInviteIntentData, normalizeEmail } from "./auth-intent-policy.ts"

export const createInviteIntentUseCase = (deps: {
  readonly users: AuthUserRepository
  readonly intents: AuthIntentRepository
}) => {
  return (input: {
    email: string
    organizationId: string
    organizationName: string
    inviterName: string
  }): Effect.Effect<AuthIntent, Error> => {
    return Effect.gen(function* () {
      const email = normalizeEmail(input.email)
      const inviteData = createInviteIntentData({
        organizationId: input.organizationId,
        organizationName: input.organizationName,
        inviterName: input.inviterName,
      })
      const existingUser = yield* deps.users.findByEmail(email)

      const intent: AuthIntent = {
        id: generateId(),
        type: "invite",
        email,
        data: inviteData,
        existingAccountAtRequest: existingUser !== null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: null,
        createdOrganizationId: null,
      }

      yield* deps.intents.save(intent)

      return intent
    })
  }
}
