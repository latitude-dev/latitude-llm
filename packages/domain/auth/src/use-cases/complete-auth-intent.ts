import { createMembership, createOrganizationUseCase, MembershipRepository } from "@domain/organizations"
import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Data, Effect, Match } from "effect"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthIntent, AuthIntentType } from "../types.ts"
import { normalizeEmail, shouldCreateOrganizationForIntent } from "./auth-intent-policy.ts"

export class InvalidAuthIntentTypeError extends Data.TaggedError("InvalidAuthIntentTypeError")<{
  readonly intentId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Invalid authentication intent type"
}

export class AuthIntentExpiredError extends Data.TaggedError("AuthIntentExpiredError")<{
  readonly intentId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Authentication intent has expired"
}

export class AuthIntentEmailMismatchError extends Data.TaggedError("AuthIntentEmailMismatchError")<{
  readonly intentId: string
  readonly intentEmail: string
  readonly sessionEmail: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Authentication intent email mismatch"
}

export class MissingSignupProvisioningDataError extends Data.TaggedError("MissingSignupProvisioningDataError")<{
  readonly intentId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Missing signup details for organization provisioning"
}

export class MissingInviteDataError extends Data.TaggedError("MissingInviteDataError")<{
  readonly intentId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Missing invite details for membership provisioning"
}

interface SessionInput {
  readonly userId: string
  readonly email: string
  readonly name: string | null
}

export const completeAuthIntentUseCase = (input: { intentId: string; session: SessionInput; now?: Date }) =>
  Effect.gen(function* () {
    const intents = yield* AuthIntentRepository

    const now = input.now ?? new Date()
    const intent = yield* intents.findById(input.intentId)

    if (intent.expiresAt.getTime() < now.getTime()) {
      return yield* new AuthIntentExpiredError({ intentId: intent.id })
    }

    if (normalizeEmail(intent.email) !== normalizeEmail(input.session.email)) {
      return yield* new AuthIntentEmailMismatchError({
        intentId: intent.id,
        intentEmail: intent.email,
        sessionEmail: input.session.email,
      })
    }

    if (intent.consumedAt) {
      return
    }

    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(handleIntentByType(intent, input.session))
  })

const handleIntentByType = (intent: AuthIntent, session: SessionInput) =>
  Effect.gen(function* () {
    const type: AuthIntentType = intent.type

    return yield* Match.value(type).pipe(
      Match.when("signup", () => handleSignup(intent, session)),
      Match.when("invite", () => handleInvite(intent, session)),
      Match.when("login", () =>
        Effect.gen(function* () {
          const intents = yield* AuthIntentRepository
          yield* intents.markConsumed({ intentId: intent.id })
          return undefined
        }),
      ),
      Match.orElse(() => Effect.fail(new InvalidAuthIntentTypeError({ intentId: intent.id }))),
    )
  })

const handleSignup = (intent: AuthIntent, session: SessionInput) =>
  Effect.gen(function* () {
    const intents = yield* AuthIntentRepository
    const users = yield* UserRepository
    const memberships = yield* MembershipRepository

    if (!shouldCreateOrganizationForIntent(intent)) {
      yield* intents.markConsumed({ intentId: intent.id })
      return
    }

    const signupName = intent.data.signup?.name
    const organizationName = intent.data.signup?.organizationName

    if (!signupName || !organizationName) {
      return yield* new MissingSignupProvisioningDataError({ intentId: intent.id })
    }

    const organization = yield* createOrganizationUseCase({
      name: organizationName,
      creatorId: UserId(session.userId),
    })

    yield* memberships.save(
      createMembership({
        organizationId: organization.id,
        userId: UserId(session.userId),
        role: "owner",
      }),
    )

    if ((!session.name || session.name.trim().length === 0) && signupName.trim().length > 0) {
      yield* users.setNameIfMissing({
        userId: session.userId,
        name: signupName,
      })
    }

    yield* intents.markConsumed({
      intentId: intent.id,
      createdOrganizationId: organization.id,
    })
  })

const handleInvite = (intent: AuthIntent, session: SessionInput) =>
  Effect.gen(function* () {
    const intents = yield* AuthIntentRepository
    const users = yield* UserRepository
    const memberships = yield* MembershipRepository

    const organizationId = intent.data.invite?.organizationId

    if (!organizationId) {
      return yield* new MissingInviteDataError({ intentId: intent.id })
    }

    yield* memberships.save(
      createMembership({
        organizationId: OrganizationId(organizationId),
        userId: UserId(session.userId),
        role: "member",
      }),
    )

    if (session.name && session.name.trim().length > 0) {
      yield* users.setNameIfMissing({
        userId: session.userId,
        name: session.name,
      })
    }

    yield* intents.markConsumed({ intentId: intent.id })
  })
