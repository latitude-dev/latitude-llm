import { QueuePublisher } from "@domain/queue"
import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
import { CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS } from "../constants.ts"
import { type CustomBehavior, CustomBehaviorStatus } from "../entities/custom-behavior.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { taxonomyGardenCustomBehaviorDedupeKey } from "./trigger-project-gardening.ts"

export interface GenerateCustomBehaviorInput {
  readonly customBehaviorId: CustomBehaviorId
  readonly reason?: "manual" | "cron"
}

/**
 * Trigger a scoped generation run for one custom behavior: flip the row to
 * `generating`, then enqueue the `gardenCustomBehavior` job (deduped on its
 * workflow id). The flip happens BEFORE the enqueue so the workflow — which owns
 * every later transition (`generating` → `ready`/`failed`) — always writes the
 * terminal status last; writing `generating` after enqueue races a fast failure
 * (e.g. the ≥15-observation gate) and would strand the row at `generating`. If
 * the enqueue itself fails the row is rolled back to its prior status.
 *
 * Organization and project come from the persisted record, never caller input,
 * so a run can only ever be scoped to the behavior's own project.
 */
export const generateCustomBehavior = Effect.fn("taxonomy.generateCustomBehavior")(function* (
  input: GenerateCustomBehaviorInput,
) {
  yield* Effect.annotateCurrentSpan("customBehaviorId", input.customBehaviorId)
  const repo = yield* CustomBehaviorRepository
  const publisher = yield* QueuePublisher

  const behavior = yield* repo.findById(input.customBehaviorId)
  const generating: CustomBehavior = { ...behavior, status: CustomBehaviorStatus.Generating, updatedAt: new Date() }
  yield* repo.save(generating)

  yield* publisher
    .publish(
      "taxonomy",
      "gardenCustomBehavior",
      {
        organizationId: behavior.organizationId,
        projectId: behavior.projectId,
        customBehaviorId: behavior.id,
        reason: input.reason ?? "manual",
      },
      {
        dedupeKey: taxonomyGardenCustomBehaviorDedupeKey({
          organizationId: behavior.organizationId,
          customBehaviorId: behavior.id,
        }),
        // Fire now, but a TTL-based dedupe marker (not a retained jobId) drops
        // re-adds for the cadence window, so create-time + the next sweep for
        // the same behavior collapse instead of the job going dormant.
        leadingThrottleMs: CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS,
      },
    )
    .pipe(Effect.onError(() => repo.save(behavior).pipe(Effect.ignore)))

  return generating
})
