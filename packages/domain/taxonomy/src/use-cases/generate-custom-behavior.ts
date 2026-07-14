import { QueuePublisher } from "@domain/queue"
import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
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
      },
    )
    .pipe(Effect.onError(() => repo.save(behavior).pipe(Effect.ignore)))

  return generating
})
