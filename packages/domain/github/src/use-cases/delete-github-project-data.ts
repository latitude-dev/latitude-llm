import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { GithubSignalReferenceRepository, GithubSyncConfigRepository } from "../ports/repositories.ts"

export interface DeleteGithubProjectDataInput {
  readonly projectId: ProjectId
}

/**
 * Cascade cleanup on `ProjectDeleted` (P3-7): drops the project's single sync
 * override and all of its signal references. Idempotent — safe to redeliver.
 */
export const deleteGithubProjectDataUseCase = (
  input: DeleteGithubProjectDataInput,
): Effect.Effect<void, RepositoryError, GithubSyncConfigRepository | GithubSignalReferenceRepository | SqlClient> =>
  Effect.gen(function* () {
    const syncConfigRepo = yield* GithubSyncConfigRepository
    const referenceRepo = yield* GithubSignalReferenceRepository
    yield* syncConfigRepo.deleteByProject(input.projectId)
    yield* referenceRepo.deleteByProject(input.projectId)
  }).pipe(Effect.withSpan("github.deleteProjectData"))
