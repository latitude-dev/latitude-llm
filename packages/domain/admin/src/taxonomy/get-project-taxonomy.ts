import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { AdminTaxonomyRepository } from "./taxonomy-repository.ts"

export interface GetProjectTaxonomyInput {
  readonly projectId: ProjectId
}

export const getProjectTaxonomyUseCase = (input: GetProjectTaxonomyInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("admin.taxonomy.projectId", input.projectId)
    const repository = yield* AdminTaxonomyRepository
    return yield* repository.getProjectTaxonomy(input.projectId)
  }).pipe(Effect.withSpan("admin.getProjectTaxonomy"))
