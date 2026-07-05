import { ApiKeyRepository } from "@domain/api-keys"
import { OutboxEventWriter } from "@domain/events"
import { type CreateProjectError, createProject, InvalidProjectNameError, ProjectRepository } from "@domain/projects"
import {
  type ConcurrentSqlTransactionError,
  generateSlug,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
} from "@domain/shared"
import { Effect } from "effect"

const SAMPLE_PROJECT_NAME = "Sample project"

export interface CreateSampleProjectInput {
  readonly organizationId: OrganizationId
  readonly actorUserId: string
}

export interface CreateSampleProjectResult {
  readonly id: string
  readonly name: string
  readonly slug: string
}

export type CreateSampleProjectError = RepositoryError | ConcurrentSqlTransactionError | CreateProjectError

// Creates the sample/demo project and emits `SampleProjectCreated` (→ demo-seeding workflow).
// Shared by normal onboarding and the claim flow. Seeding uses the org's first API key; with
// none, the project is still created but seeding is skipped.
export const createSampleProjectUseCase = Effect.fn("organizations.createSampleProject")(function* (
  input: CreateSampleProjectInput,
) {
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const apiKeyRepo = yield* ApiKeyRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const slug = yield* generateSlug({
        name: SAMPLE_PROJECT_NAME,
        count: (candidate) => projectRepo.countBySlug(candidate),
      }).pipe(
        Effect.catchTag("InvalidSlugInputError", (error) =>
          Effect.fail(new InvalidProjectNameError({ field: SAMPLE_PROJECT_NAME, message: error.reason })),
        ),
      )

      const sampleProject = createProject({
        organizationId: input.organizationId,
        name: SAMPLE_PROJECT_NAME,
        slug,
        settings: { isSample: true },
      })
      // Skip createProjectUseCase so sample data seeding is the only side effect for this project.
      yield* projectRepo.save(sampleProject)

      const apiKeys = yield* apiKeyRepo.list()
      const apiKey = apiKeys[0]
      if (apiKey) {
        yield* outboxEventWriter
          .write({
            eventName: "SampleProjectCreated",
            aggregateType: "project",
            aggregateId: sampleProject.id,
            organizationId: input.organizationId,
            payload: {
              organizationId: input.organizationId,
              projectId: sampleProject.id,
              queueAssigneeUserIds: [input.actorUserId],
              apiKeyId: apiKey.id as string,
              timelineAnchorIso: new Date().toISOString(),
            },
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
      }

      return {
        id: sampleProject.id as string,
        name: sampleProject.name,
        slug: sampleProject.slug,
      } satisfies CreateSampleProjectResult
    }),
  )
})
