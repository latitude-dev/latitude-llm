import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { GithubSyncConfigRepository } from "../ports/repositories.ts"

export interface ResetGithubProjectOverrideInput {
  readonly projectId: ProjectId
}

/**
 * Removes a project's repo override so it falls back to the org default (D16).
 * Scoped by RLS to the caller's org; a project with no override is a no-op.
 */
export const resetGithubProjectOverrideUseCase = (
  input: ResetGithubProjectOverrideInput,
): Effect.Effect<void, RepositoryError, GithubSyncConfigRepository | SqlClient> =>
  Effect.gen(function* () {
    const repo = yield* GithubSyncConfigRepository
    yield* repo.deleteByProject(input.projectId)
  }).pipe(Effect.withSpan("github.resetProjectOverride"))
