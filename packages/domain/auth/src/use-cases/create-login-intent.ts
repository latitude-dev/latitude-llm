import type { RepositoryError } from "@domain/shared"
import { Data, Effect } from "effect"
import { createAuthIntent } from "../entities/auth-intent.ts"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import { AuthUserRepository } from "../ports/auth-user-repository.ts"
import type { AuthIntent } from "../types.ts"
import { normalizeEmail } from "./auth-intent-policy.ts"

export class LoginUserNotFoundError extends Data.TaggedError("LoginUserNotFoundError")<{
  readonly email: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "No account found for this email"
}

export type CreateLoginIntentError = LoginUserNotFoundError | RepositoryError

export const createLoginIntentUseCase = (input: {
  email: string
}): Effect.Effect<AuthIntent, CreateLoginIntentError, AuthIntentRepository | AuthUserRepository> =>
  Effect.gen(function* () {
    const users = yield* AuthUserRepository
    const intents = yield* AuthIntentRepository

    const email = normalizeEmail(input.email)

    yield* users
      .findByEmail(email)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(new LoginUserNotFoundError({ email }))))

    const intent = createAuthIntent({
      type: "login",
      email,
      data: {},
      existingAccountAtRequest: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    yield* intents.save(intent)

    return intent
  })
