import { NotFoundError, type TaxonomyCategoryId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCategory } from "../entities/category.ts"
import { cosineSimilarity } from "../helpers.ts"
import type { BestCategoryMatch, TaxonomyCategoryRepositoryShape } from "../ports/taxonomy-category-repository.ts"

export const createFakeTaxonomyCategoryRepository = (
  seed: readonly TaxonomyCategory[] = [],
  overrides?: Partial<TaxonomyCategoryRepositoryShape>,
) => {
  const categories = new Map<TaxonomyCategoryId, TaxonomyCategory>(
    seed.map((category) => [category.id, category] as const),
  )

  const repository: TaxonomyCategoryRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const category = categories.get(id)
        if (!category) return yield* new NotFoundError({ entity: "TaxonomyCategory", id })
        return category
      }),

    listByProject: ({ projectId, state }) =>
      Effect.sync(() =>
        [...categories.values()].filter(
          (category) => category.projectId === projectId && (state ? category.state === state : true),
        ),
      ),

    findBestMatchByVector: ({ projectId, queryVector }) =>
      Effect.sync(() => {
        let best: BestCategoryMatch | null = null
        for (const category of categories.values()) {
          if (
            category.projectId !== projectId ||
            category.state !== "active" ||
            category.centroidEmbedding.length === 0
          )
            continue
          const cosine = cosineSimilarity(queryVector, category.centroidEmbedding)
          if (!best || cosine > best.cosine) {
            best = { category, cosine }
          }
        }
        return best
      }),

    save: (category) =>
      Effect.sync(() => {
        categories.set(category.id, category)
      }),

    markDeprecated: ({ categoryId, timestamp }) =>
      Effect.sync(() => {
        const existing = categories.get(categoryId)
        if (existing) {
          categories.set(categoryId, { ...existing, state: "deprecated", updatedAt: timestamp })
        }
      }),

    ...overrides,
  }

  return { repository, categories }
}
