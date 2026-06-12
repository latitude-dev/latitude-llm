import { createProjectUseCase, ProjectRepository } from "@domain/projects"
import { type OrganizationId, type ProjectId, SqlClient, type UserId } from "@domain/shared"
import { Effect } from "effect"

export interface FindOrCreateLinkedSandboxProjectInput {
  /** The sandbox org this runs in — must match the SqlClient scope. */
  readonly sandboxOrganizationId: OrganizationId
  /** The production project's stable id the sandbox project links to. */
  readonly liveProjectId: ProjectId
  /** Name for the sandbox project when this call has to create it. */
  readonly liveProjectName: string
  readonly actorUserId: UserId
}

/**
 * The sandbox project mirroring a live project (matched by `linkedProjectId`),
 * created from the live project's name on first entry.
 */
export const findOrCreateLinkedSandboxProjectUseCase = Effect.fn("sandboxes.findOrCreateLinkedSandboxProject")(
  function* (input: FindOrCreateLinkedSandboxProjectInput) {
    yield* Effect.annotateCurrentSpan("organization.id", input.sandboxOrganizationId)

    const sqlClient = yield* SqlClient
    if (sqlClient.organizationId !== input.sandboxOrganizationId) {
      return yield* Effect.die(
        `findOrCreateLinkedSandboxProject must run scoped to the sandbox org (${input.sandboxOrganizationId}), got ${sqlClient.organizationId}`,
      )
    }

    const projects = yield* ProjectRepository
    const existing = (yield* projects.list()).find((project) => project.linkedProjectId === input.liveProjectId)
    if (existing) return existing

    return yield* createProjectUseCase({
      name: input.liveProjectName,
      actorUserId: input.actorUserId,
      linkedProjectId: input.liveProjectId,
    })
  },
)
