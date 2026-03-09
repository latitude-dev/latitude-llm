import { createMembership, createOrganizationUseCase } from "@domain/organizations"
import type { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import type { CreateOrganizationError } from "@domain/organizations"
import type { NotFoundError, RepositoryError } from "@domain/shared"
import { OrganizationId, UserId } from "@domain/shared"
import { Data, Effect, Match } from "effect"
import type { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthUserRepository } from "../ports/auth-user-repository.ts"
import type { AuthIntent, AuthIntentType } from "../types.ts"
import { normalizeEmail, shouldCreateOrganizationForIntent } from "./auth-intent-policy.ts"

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

export type CompleteAuthIntentError =
  | NotFoundError
  | AuthIntentExpiredError
  | AuthIntentEmailMismatchError
  | MissingSignupProvisioningDataError
  | MissingInviteDataError
  | CreateOrganizationError
  | RepositoryError

interface SessionInput {
  readonly userId: string
  readonly email: string
  readonly name: string | null
}

export const completeAuthIntentUseCase = (deps: {
  readonly intents: AuthIntentRepository
  readonly organizations: OrganizationRepository
  readonly memberships: MembershipRepository
  readonly users: AuthUserRepository
}) => {
  return (input: {
    intentId: string
    session: SessionInput
    now?: Date
  }): Effect.Effect<void, CompleteAuthIntentError> => {
    return Effect.gen(function* () {
      const now = input.now ?? new Date()
      const intent = yield* deps.intents.findById(input.intentId)

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

      yield* handleIntentByType(deps, intent, input.session)
    })
  }
}

const handleIntentByType = (
  deps: {
    readonly intents: AuthIntentRepository
    readonly organizations: OrganizationRepository
    readonly memberships: MembershipRepository
    readonly users: AuthUserRepository
  },
  intent: AuthIntent,
  session: SessionInput,
): Effect.Effect<void, CompleteAuthIntentError> => {
  const type: AuthIntentType = intent.type

  return Match.value(type).pipe(
    Match.when("signup", () => handleSignup(deps, intent, session)),
    Match.when("invite", () => handleInvite(deps, intent, session)),
    Match.when("login", () => deps.intents.markConsumed({ intentId: intent.id })),
    Match.exhaustive,
  )
}

const handleSignup = (
  deps: {
    readonly intents: AuthIntentRepository
    readonly organizations: OrganizationRepository
    readonly memberships: MembershipRepository
    readonly users: AuthUserRepository
  },
  intent: AuthIntent,
  session: SessionInput,
): Effect.Effect<void, CompleteAuthIntentError> =>
  Effect.gen(function* () {
    if (!shouldCreateOrganizationForIntent(intent)) {
      yield* deps.intents.markConsumed({ intentId: intent.id })
      return
    }

    const signupName = intent.data.signup?.name
    const organizationName = intent.data.signup?.organizationName

    if (!signupName || !organizationName) {
      return yield* new MissingSignupProvisioningDataError({ intentId: intent.id })
    }

    const organization = yield* createOrganizationUseCase(deps.organizations)({
      name: organizationName,
      creatorId: UserId(session.userId),
    })

    yield* deps.memberships.save(
      createMembership({
        organizationId: organization.id,
        userId: UserId(session.userId),
        role: "owner",
        confirmedAt: new Date(),
      }),
    )

    if ((!session.name || session.name.trim().length === 0) && signupName.trim().length > 0) {
      yield* deps.users.setNameIfMissing({
        userId: session.userId,
        name: signupName,
      })
    }

    yield* deps.intents.markConsumed({
      intentId: intent.id,
      createdOrganizationId: organization.id,
    })
  })

const handleInvite = (
  deps: {
    readonly intents: AuthIntentRepository
    readonly memberships: MembershipRepository
    readonly users: AuthUserRepository
  },
  intent: AuthIntent,
  session: SessionInput,
): Effect.Effect<void, MissingInviteDataError | RepositoryError> =>
  Effect.gen(function* () {
    const organizationId = intent.data.invite?.organizationId

    if (!organizationId) {
      return yield* new MissingInviteDataError({ intentId: intent.id })
    }

    yield* deps.memberships.save(
      createMembership({
        organizationId: OrganizationId(organizationId),
        userId: UserId(session.userId),
        role: "member",
        confirmedAt: new Date(),
      }),
    )

    if (session.name && session.name.trim().length > 0) {
      yield* deps.users.setNameIfMissing({
        userId: session.userId,
        name: session.name,
      })
    }

    yield* deps.intents.markConsumed({ intentId: intent.id })
  })
