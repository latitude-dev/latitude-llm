import type { NotFoundError, ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { AdminProjectDetails } from "./project-details.ts"
import { AdminProjectRepository } from "./project-repository.ts"

export interface GetProjectDetailsInput {
  readonly projectId: ProjectId
}

export const getProjectDetailsUseCase = (
  input: GetProjectDetailsInput,
): Effect.Effect<AdminProjectDetails, NotFoundError | RepositoryError, AdminProjectRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("admin.targetProjectId", input.projectId)
    const repo = yield* AdminProjectRepository
    return yield* repo.findById(input.projectId)
  }).pipe(Effect.withSpan("admin.getProjectDetails"))
