import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface ListAllProjectsInput {
  readonly organizationId: OrganizationId
  readonly includeDeleted: boolean
}

export const listAllProjectsUseCase = (
  input: ListAllProjectsInput,
): Effect.Effect<readonly Project[], RepositoryError, ProjectRepository | SqlClient> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("project.organizationId", input.organizationId)
    const repo = yield* ProjectRepository
    if (input.includeDeleted) return yield* repo.listIncludingDeleted()

    return yield* repo.list()
  }).pipe(Effect.withSpan("projects.listAllProjects"))
