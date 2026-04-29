import type { ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Flagger } from "../entities/flagger.ts"
import type { FlaggerSlug } from "../flagger-strategies/types.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { evictProjectFlaggersUseCase } from "./get-project-flaggers.ts"

export interface UpdateFlaggerInput {
  readonly organizationId: string
  readonly projectId: ProjectId
  readonly slug: FlaggerSlug
  readonly enabled: boolean
}

export type UpdateFlaggerError = RepositoryError

/**
 * Updates a flagger row and evicts the project's flagger cache entry so
 * `processFlaggersUseCase` picks up the new `enabled` value on the next run
 * (otherwise the 5-minute cache TTL would gate the change). Eviction is
 * folded in here so callers can't forget — `evictProjectFlaggersUseCase` is
 * permissive (no-op when `CacheStore` isn't in the layer).
 */
export const updateFlaggerUseCase = Effect.fn("flaggers.updateFlagger")(function* (input: UpdateFlaggerInput) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.slug", input.slug)

  const repository = yield* FlaggerRepository
  const updated = yield* repository.update({
    projectId: input.projectId,
    slug: input.slug,
    enabled: input.enabled,
  })

  yield* evictProjectFlaggersUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
  })

  return updated satisfies Flagger | null
})
