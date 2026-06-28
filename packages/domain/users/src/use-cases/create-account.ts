import { OutboxEventWriter } from "@domain/events"
import { OAuthKeyRepository } from "@domain/oauth-keys"
import {
  generateId,
  type OrganizationId,
  type RepositoryError,
  toRepositoryError,
  VerificationId,
} from "@domain/shared"
import { Effect } from "effect"

import { UserRepository } from "../ports/user-repository.ts"

export interface CreateAccountInput {
  /** Organization the request is scoped to (the active org for OAuth, the org owning the API key otherwise). */
  readonly organizationId: OrganizationId
  readonly email: string
  /**
   * Base URL of the web app, used to build the magic link accept URL the
   * recipient receives by email. Taken as input rather than read from env so
   * the use-case stays portable across processes.
   */
  readonly webUrl: string
}

export interface CreateAccountResult {
  readonly success: boolean
  readonly email: string
  readonly message: string
  readonly token?: string
}

/**
 * Adds a verification value to the "verifications" table,
 * Behaviorally mirrors `betterAuth.api.signInMagicLink` so the API and
 * web produce identical rows + side effects:
 *
 * 1. Generates a hashedToken. Adds email, hashedToken, expiresAt to
 * verification table
 * 2. Pushes MagicLinkEmailRequested event to outbox
 *
 */
export const createAccountUseCase = Effect.fn("users.createAccount")(function* (input: CreateAccountInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("email", input.email)

  const normalizedEmail = input.email.trim().toLowerCase()

  const userRepo = yield* UserRepository
  const oAuthKeyRepo = yield* OAuthKeyRepository
  const outboxEventWriter = yield* OutboxEventWriter

  const user = yield* userRepo.findByEmail(normalizedEmail).pipe(
    Effect.catchTags({
      NotFoundError: () => Effect.succeed(undefined),
      RepositoryError: (err) => {
        console.log(err)
        return Effect.fail(err)
      },
    }),
  )

  if (user) {
    return {
      success: false,
      email: normalizedEmail,
      message: "A user with this email already exists",
    }
  }

  const verificationToken = generateId()

  const realBaseURL = new URL(input.webUrl)

  const pathname = realBaseURL.pathname === "/" ? "" : realBaseURL.pathname
  const basePath = "/api/auth"
  const url = new URL(`${pathname}${basePath}/magic-link/verify`, realBaseURL.origin)
  url.searchParams.set("token", verificationToken)
  url.searchParams.set("callbackURL", "/")

  yield* oAuthKeyRepo.createVerificationValue({
    id: VerificationId(generateId()),
    hashedToken: verificationToken,
    expiresAt: new Date(Date.now() + 60 * 5 * 1000),
    value: JSON.stringify({ email: normalizedEmail }),
  })

  yield* outboxEventWriter
    .write({
      eventName: "MagicLinkEmailRequested",
      aggregateType: "email_request",
      aggregateId: generateId(),
      organizationId: "system",
      payload: {
        email: normalizedEmail,
        magicLinkUrl: url.toString(),
        organizationId: "system",
      },
    })
    .pipe(Effect.mapError((error): RepositoryError => toRepositoryError(error, "write InvitationEmailRequested")))

  return {
    success: true,
    email: normalizedEmail,
    message: "A magic link has been sent to this email",
    token: verificationToken,
  }
})
