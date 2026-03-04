import { generateId } from "@domain/shared"
import type { RepositoryError } from "@domain/shared"
import { Data, Effect } from "effect"
import type { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthUserRepository } from "../ports/auth-user-repository.ts"
import type { AuthIntent } from "../types.ts"
import { normalizeEmail } from "./auth-intent-policy.ts"

export class LoginUserNotFoundError extends Data.TaggedError("LoginUserNotFoundError")<{
  readonly email: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "No account found for this email"
}

export type CreateLoginIntentError = LoginUserNotFoundError | RepositoryError

export const createLoginIntentUseCase = (deps: {
  readonly users: AuthUserRepository
  readonly intents: AuthIntentRepository
}) => {
  return (input: { email: string }): Effect.Effect<AuthIntent, CreateLoginIntentError> => {
    return Effect.gen(function* () {
      const email = normalizeEmail(input.email)
      const existingUser = yield* deps.users.findByEmail(email)

      if (!existingUser) {
        return yield* new LoginUserNotFoundError({ email })
      }

      const intent: AuthIntent = {
        id: generateId(),
        type: "login",
        email,
        data: {},
        existingAccountAtRequest: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: null,
        createdOrganizationId: null,
      }

      yield* deps.intents.save(intent)

      return intent
    })
  }
}
