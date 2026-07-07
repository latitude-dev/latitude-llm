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
import { createSampleProjectUseCase } from "./create-sample-project.ts"

export interface ProvisionOrganizationWorkspaceInput {
  readonly organizationId: OrganizationId
  readonly actorUserId: string
  readonly name: string
  readonly slug: string
  readonly defaultProjectName: string
}

export interface ProvisionOrganizationWorkspaceResult {
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
  readonly sampleProject: {
    readonly id: string
    readonly name: string
    readonly slug: string
  }
}

export type ProvisionOrganizationWorkspaceError =
  | RepositoryError
  | NotFoundError
  | ConcurrentSqlTransactionError
  | GenerateApiKeyError
  | CreateProjectError

export const provisionOrganizationWorkspaceUseCase = Effect.fn("organizations.provisionOrganizationWorkspace")(
  function* (input: ProvisionOrganizationWorkspaceInput) {
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

        // Shared with the claim flow; seeding uses the org's first API key (here the just-created default).
        const sampleProject = yield* createSampleProjectUseCase({
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
        })

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
          sampleProject: {
            id: sampleProject.id,
            name: sampleProject.name,
            slug: sampleProject.slug,
          },
        }
      }),
    )
  },
)
