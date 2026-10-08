import { OutboxEventWriter } from "@domain/events"
import {
  InvalidRedactionRuleError,
  isSameRedactionSetting,
  type NotFoundError,
  type ProjectId,
  type RedactionSetting,
  type RepositoryError,
  rejectInvalidRedactionRules,
  rejectionMessage,
  SqlClient,
  toRepositoryError,
  withPreservedRedactionRules,
  withServerValidatorVersion,
} from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { ProjectNotFoundError, RedactionPolicyForbiddenError } from "../errors.ts"
import { ProjectRedactionAuthorizer } from "../ports/project-redaction-authorizer.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface UpdateProjectRedactionInput {
  readonly projectId: ProjectId
  readonly actorUserId: string
  /** `null` removes the project override, falling back to the organization policy. */
  readonly redaction: RedactionSetting | null
}

export type UpdateProjectRedactionError =
  | RepositoryError
  | NotFoundError
  | ProjectNotFoundError
  | RedactionPolicyForbiddenError
  | InvalidRedactionRuleError

export const updateProjectRedactionUseCase = Effect.fn("projects.updateProjectRedaction")(function* (
  input: UpdateProjectRedactionInput,
) {
  yield* Effect.annotateCurrentSpan("project.id", input.projectId)
  yield* Effect.annotateCurrentSpan("actor.userId", input.actorUserId)

  const sqlClient = yield* SqlClient
  const { organizationId } = sqlClient
  const authorizer = yield* ProjectRedactionAuthorizer
  const isAdmin = input.actorUserId ? yield* authorizer.isOrganizationAdmin(organizationId, input.actorUserId) : false
  if (!isAdmin) return yield* new RedactionPolicyForbiddenError()

  const rejected = rejectInvalidRedactionRules(input.redaction)
  if (rejected) return yield* new InvalidRedactionRuleError({ message: rejectionMessage(rejected) })

  const incomingRedaction = withServerValidatorVersion(input.redaction)

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      const existing = yield* repo
        .findByIdForUpdate(input.projectId)
        .pipe(
          Effect.catchTag("NotFoundError", () =>
            Effect.fail(new ProjectNotFoundError({ id: input.projectId, organizationId })),
          ),
        )

      const fromRedaction = existing.settings?.redaction ?? null
      const toRedaction = withPreservedRedactionRules(fromRedaction, incomingRedaction)

      if (isSameRedactionSetting(fromRedaction, toRedaction)) return existing

      const { redaction: _dropped, ...settingsWithoutRedaction } = existing.settings ?? {}
      const now = new Date()
      const updated: Project = {
        ...existing,
        settings: {
          ...settingsWithoutRedaction,
          ...(toRedaction !== null ? { redaction: toRedaction } : {}),
        },
        lastEditedAt: now,
        updatedAt: now,
      }

      yield* repo.save(updated)

      const outboxEventWriter = yield* OutboxEventWriter
      yield* outboxEventWriter
        .write({
          eventName: "ProjectRedactionPolicyChanged",
          aggregateType: "project",
          aggregateId: existing.id,
          organizationId,
          payload: {
            organizationId,
            actorUserId: input.actorUserId,
            projectId: existing.id,
            fromRedaction,
            toRedaction,
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      return updated
    }),
  )
})
