import { DEFAULT_API_KEY_NAME, type GenerateApiKeyError, generateApiKeyUseCase } from "@domain/api-keys"
import { OutboxEventWriter } from "@domain/events"
import { type CreateProjectError, createProjectUseCase } from "@domain/projects"
import {
  type ConcurrentSqlTransactionError,
  type NotFoundError,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface CompleteOnboardingInput {
  readonly organizationId: OrganizationId
  readonly actorUserId: string
  readonly name: string
  readonly slug: string
  readonly defaultProjectName: string
}

export interface CompleteOnboardingResult {
  readonly defaultApiKey: {
    readonly id: string
    readonly name: string
    readonly token: string
  }
  readonly defaultProject: {
    readonly id: string
    readonly name: string
    readonly slug: string
  }
}

export type CompleteOnboardingError =
  | RepositoryError
  | NotFoundError
  | ConcurrentSqlTransactionError
  | GenerateApiKeyError
  | CreateProjectError

export const completeOnboardingUseCase = Effect.fn("organizations.completeOnboarding")(function* (
  input: CompleteOnboardingInput,
) {
  const sqlClient = yield* SqlClient

  yield* Effect.annotateCurrentSpan("organization.id", input.organizationId)

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const outboxEventWriter = yield* OutboxEventWriter
      const organizationRepo = yield* OrganizationRepository

      const organization = yield* organizationRepo.findById(input.organizationId)
      yield* organizationRepo.save({
        ...organization,
        settings: { ...organization.settings, wantsShowcase: true },
      })

      const defaultApiKey = yield* generateApiKeyUseCase({
        name: DEFAULT_API_KEY_NAME,
        isSandbox: false,
        actorUserId: input.actorUserId,
      })

      const defaultProject = yield* createProjectUseCase({
        name: input.defaultProjectName,
        actorUserId: input.actorUserId,
      })

      yield* outboxEventWriter
        .write({
          eventName: "OrganizationCreated",
          aggregateType: "organization",
          aggregateId: input.organizationId,
          organizationId: input.organizationId,
          payload: {
            organizationId: input.organizationId,
            actorUserId: input.actorUserId,
            name: input.name,
            slug: input.slug,
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      // Only the org's real empty project; the demo is the shared showcase, not a per-org copy.
      return {
        defaultApiKey: {
          id: defaultApiKey.id,
          name: defaultApiKey.name,
          token: defaultApiKey.token,
        },
        defaultProject: {
          id: defaultProject.id,
          name: defaultProject.name,
          slug: defaultProject.slug,
        },
      }
    }),
  )
})
