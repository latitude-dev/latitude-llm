import { createMembership, createOrganizationUseCase } from "@domain/organizations"
import type { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import type { CreateOrganizationError } from "@domain/organizations"
import type { RepositoryError } from "@domain/shared-kernel"
import { OrganizationId, UserId, generateId } from "@domain/shared-kernel"
import { Data, Effect } from "effect"
import type { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthUserRepository } from "../ports/auth-user-repository.ts"
import { normalizeEmail, shouldCreateOrganizationForIntent } from "./auth-intent-policy.ts"

export class AuthIntentNotFoundError extends Data.TaggedError("AuthIntentNotFoundError")<{
  readonly intentId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Invalid authentication intent"
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

export type CompleteAuthIntentError =
  | AuthIntentNotFoundError
  | AuthIntentExpiredError
  | AuthIntentEmailMismatchError
  | MissingSignupProvisioningDataError
  | CreateOrganizationError
  | RepositoryError
  | Error

export const completeAuthIntentUseCase = (deps: {
  readonly intents: AuthIntentRepository
  readonly organizations: OrganizationRepository
  readonly memberships: MembershipRepository
  readonly users: AuthUserRepository
}) => {
  return (input: {
    intentId: string
    session: {
      userId: string
      email: string
      name: string | null
    }
  }): Effect.Effect<{ completed: true }, CompleteAuthIntentError> => {
    return Effect.gen(function* () {
      const intent = yield* deps.intents.findById(input.intentId)

      if (!intent) {
        return yield* new AuthIntentNotFoundError({ intentId: input.intentId })
      }

      if (intent.expiresAt.getTime() < Date.now()) {
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
        return { completed: true as const }
      }

      if (shouldCreateOrganizationForIntent(intent)) {
        const signupName = intent.data.signup?.name
        const organizationName = intent.data.signup?.organizationName

        if (!signupName || !organizationName) {
          return yield* new MissingSignupProvisioningDataError({ intentId: intent.id })
        }

        const organization = yield* createOrganizationUseCase(deps.organizations)({
          id: OrganizationId(generateId()),
          name: organizationName,
          creatorId: UserId(input.session.userId),
        })

        yield* deps.memberships.save(
          createMembership({
            id: generateId(),
            organizationId: organization.id,
            userId: UserId(input.session.userId),
            role: "owner",
            confirmedAt: new Date(),
          }),
        )

        if ((!input.session.name || input.session.name.trim().length === 0) && signupName.trim().length > 0) {
          yield* deps.users.setNameIfMissing({
            userId: input.session.userId,
            name: signupName,
          })
        }

        yield* deps.intents.markConsumed({
          intentId: intent.id,
          createdOrganizationId: organization.id,
        })

        return { completed: true as const }
      }

      yield* deps.intents.markConsumed({ intentId: intent.id })

      return { completed: true as const }
    })
  }
}
