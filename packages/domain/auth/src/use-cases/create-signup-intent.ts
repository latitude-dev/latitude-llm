import { generateId } from "@domain/shared"
import { Effect } from "effect"
import type { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthUserRepository } from "../ports/auth-user-repository.ts"
import type { AuthIntent } from "../types.ts"
import { createSignupIntentData, normalizeEmail } from "./auth-intent-policy.ts"

export const createSignupIntentUseCase = (deps: {
  readonly users: AuthUserRepository
  readonly intents: AuthIntentRepository
}) => {
  return (input: { email: string; name: string; organizationName: string }): Effect.Effect<AuthIntent, Error> => {
    return Effect.gen(function* () {
      const email = normalizeEmail(input.email)
      const signupData = createSignupIntentData({
        name: input.name,
        organizationName: input.organizationName,
      })
      const existingUser = yield* deps.users.findByEmail(email)

      const intent: AuthIntent = {
        id: generateId(),
        type: "signup",
        email,
        data: signupData,
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
