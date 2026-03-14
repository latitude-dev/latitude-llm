import type { OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Project } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"

export interface ListAllProjectsInput {
  readonly organizationId: OrganizationId
  readonly includeDeleted: boolean
}

export const listAllProjectsUseCase = (
  input: ListAllProjectsInput,
): Effect.Effect<readonly Project[], RepositoryError, ProjectRepository> =>
  Effect.gen(function* () {
    const repo = yield* ProjectRepository
    if (input.includeDeleted) return yield* repo.findAllIncludingDeleted()

    return yield* repo.findAll()
  })
