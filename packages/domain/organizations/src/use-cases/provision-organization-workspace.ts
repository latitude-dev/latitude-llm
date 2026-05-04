import { DEFAULT_API_KEY_NAME, type GenerateApiKeyError, generateApiKeyUseCase } from "@domain/api-keys"
import { OutboxEventWriter } from "@domain/events"
import { type CreateProjectError, createProjectUseCase } from "@domain/projects"
import {
  type ConcurrentSqlTransactionError,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
} from "@domain/shared"
import { Effect } from "effect"

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
}

export type ProvisionOrganizationWorkspaceError =
  | RepositoryError
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

        const defaultApiKey = yield* generateApiKeyUseCase({
          name: DEFAULT_API_KEY_NAME,
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
  },
)
