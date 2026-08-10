import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { ImportJobRepository } from "../ports/import-job-repository.ts"

interface DeleteProjectImportsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

/**
 * Cascade cleanup on `ProjectDeleted`. A queued or running import for a deleted
 * project would keep paging its source and writing spans into a project nobody
 * can see, and — because one import runs per org — would hold the org's only
 * slot until it finished. Deleting the rows drops the chain: the next `fetchPage`
 * finds no job and stops. Application-layer, per the no-FK platform rule.
 */
export const deleteProjectImportsUseCase = (input: DeleteProjectImportsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const jobs = yield* ImportJobRepository
    const existing = yield* jobs.listByProjectId(input.projectId)
    if (existing.length === 0) return { deleted: 0 }

    yield* jobs.deleteByProjectId(input.projectId)
    return { deleted: existing.length }
  }).pipe(Effect.withSpan("imports.deleteProjectImports")) as Effect.Effect<
    { readonly deleted: number },
    RepositoryError,
    SqlClient | ImportJobRepository
  >
