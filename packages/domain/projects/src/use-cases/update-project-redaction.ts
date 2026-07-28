import { OutboxEventWriter } from "@domain/events"
import {
  type NotFoundError,
  type ProjectId,
  type RedactionSetting,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { ProjectNotFoundError } from "../errors.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface UpdateProjectRedactionInput {
  readonly projectId: ProjectId
  readonly actorUserId: string
  /** `null` removes the project override, falling back to the organization policy. */
  readonly redaction: RedactionSetting | null
}

export type UpdateProjectRedactionError = RepositoryError | NotFoundError | ProjectNotFoundError

/**
 * Changes only the `redaction` key, leaving every sibling setting alone, and records
 * the transition in the same transaction as the write. Separate from
 * `updateProjectUseCase` because a compliance control needs an audit trail that
 * cannot come apart from the change it describes.
 */
export const updateProjectRedactionUseCase = Effect.fn("projects.updateProjectRedaction")(function* (
  input: UpdateProjectRedactionInput,
) {
  yield* Effect.annotateCurrentSpan("project.id", input.projectId)
  yield* Effect.annotateCurrentSpan("actor.userId", input.actorUserId)

  const sqlClient = yield* SqlClient
  const { organizationId } = sqlClient

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
      const toRedaction = input.redaction

      if (isSameRedaction(fromRedaction, toRedaction)) return existing

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

const isSameRedaction = (a: RedactionSetting | null, b: RedactionSetting | null): boolean =>
  JSON.stringify(normalizeRedaction(a)) === JSON.stringify(normalizeRedaction(b))

/** Entity order is a UI artifact, so sort before comparing or a reorder reads as a change. */
const normalizeRedaction = (setting: RedactionSetting | null) =>
  setting === null
    ? null
    : {
        mode: setting.mode ?? null,
        entities: setting.entities ? [...setting.entities].sort() : null,
        metadata: setting.scopes?.metadata ?? null,
        identities: setting.identities ?? null,
      }
