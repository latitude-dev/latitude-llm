import { Effect } from "effect"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import { TaxonomyLineageRepository } from "../ports/taxonomy-lineage-repository.ts"

export interface EmitLineageInput {
  readonly transitions: readonly TaxonomyClusterLineage[]
}

export const emitLineageUseCase = (input: EmitLineageInput) =>
  Effect.gen(function* () {
    if (input.transitions.length === 0) return { emitted: 0 }
    const repository = yield* TaxonomyLineageRepository
    yield* repository.appendMany(input.transitions)
    return { emitted: input.transitions.length }
  }).pipe(Effect.withSpan("taxonomy.emitLineage"))
