import { defineError } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import { createAuthIntent } from "../entities/auth-intent.ts"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import { normalizeEmail } from "./auth-intent-policy.ts"

export class LoginUserNotFoundError extends defineError(
  "LoginUserNotFoundError",
  400,
  "No account found for this email",
)<{
  readonly email: string
}> {}

export const createLoginIntentUseCase = (input: { email: string }) =>
  Effect.gen(function* () {
    const users = yield* UserRepository
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
