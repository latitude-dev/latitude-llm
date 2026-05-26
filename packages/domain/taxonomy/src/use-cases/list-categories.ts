import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCategory } from "../entities/category.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"

export interface ListCategoriesInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly state?: TaxonomyCategory["state"]
  readonly includeEmpty?: boolean
}

export interface ListCategoriesResult {
  readonly categories: readonly TaxonomyCategory[]
}

export const listCategoriesUseCase = (input: ListCategoriesInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const categories = yield* TaxonomyCategoryRepository
    const rows = yield* categories.listByProject({
      projectId: input.projectId,
      state: input.state ?? "active",
    })
    const filtered = input.includeEmpty ? rows : rows.filter((category) => category.clusterCount > 0)
    return { categories: filtered } satisfies ListCategoriesResult
  }).pipe(Effect.withSpan("taxonomy.listCategories"))
