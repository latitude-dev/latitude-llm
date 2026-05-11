import { OutboxEventWriter } from "@domain/events"
import { type ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
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
  readonly actorUserId?: string
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

  const sqlClient = yield* SqlClient
  const updated = yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repository = yield* FlaggerRepository
      const row = yield* repository.update({
        projectId: input.projectId,
        slug: input.slug,
        enabled: input.enabled,
      })

      if (row) {
        const outboxEventWriter = yield* OutboxEventWriter
        yield* outboxEventWriter.write({
          eventName: "FlaggerToggled",
          aggregateType: "flagger",
          aggregateId: row.id,
          organizationId: input.organizationId,
          payload: {
            organizationId: input.organizationId,
            actorUserId: input.actorUserId ?? "",
            projectId: input.projectId,
            flaggerSlug: input.slug,
            enabled: input.enabled,
          },
        })
      }

      return row
    }),
  )

  // Evict AFTER the transaction commits so a concurrent reader can't
  // repopulate the cache with the stale value between eviction and commit.
  yield* evictProjectFlaggersUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
  })

  return updated satisfies Flagger | null
})
