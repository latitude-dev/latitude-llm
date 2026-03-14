import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import { createAuthIntent } from "../entities/auth-intent.ts"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import { createSignupIntentData, normalizeEmail } from "./auth-intent-policy.ts"

export const createSignupIntentUseCase = (input: { email: string; name: string; organizationName: string }) =>
  Effect.gen(function* () {
    const users = yield* UserRepository
    const intents = yield* AuthIntentRepository

    const email = normalizeEmail(input.email)
    const signupData = createSignupIntentData({
      name: input.name,
      organizationName: input.organizationName,
    })
    const existingUser = yield* users
      .findByEmail(email)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    const intent = createAuthIntent({
      type: "signup",
      email,
      data: signupData,
      existingAccountAtRequest: existingUser !== null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    yield* intents.save(intent)

    return intent
  })
