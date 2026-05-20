import { OutboxEventWriter } from "@domain/events"
import { SqlClient, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface PurgeOrganizationProjectsInput {
  /** Attributed as the actor on each emitted `ProjectDeleted` event. */
  readonly actorUserId?: string
}

/**
 * Soft-delete every project of the current organization and emit a
 * `ProjectDeleted` event for each, so the per-project cleanup cascade (e.g.
 * notifications) runs — exactly as if each project had been deleted by hand.
 *
 * Scoped to the organization bound on the `SqlClient`: provide a client for the
 * org being torn down. Used when an organization is deleted, both directly
 * (org settings danger zone) and as part of account deletion.
 */
export const purgeOrganizationProjectsUseCase = Effect.fn("projects.purgeOrganizationProjects")(function* (
  input: PurgeOrganizationProjectsInput,
) {
  const sqlClient = yield* SqlClient
  const { organizationId } = sqlClient

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const projects = yield* repo.list()
      for (const project of projects) {
        yield* repo.softDelete(project.id)
        yield* outboxEventWriter
          .write({
            eventName: "ProjectDeleted",
            aggregateType: "project",
            aggregateId: project.id,
            organizationId,
            payload: {
              organizationId,
              actorUserId: input.actorUserId ?? "",
              projectId: project.id,
            },
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
      }
    }),
  )
})
