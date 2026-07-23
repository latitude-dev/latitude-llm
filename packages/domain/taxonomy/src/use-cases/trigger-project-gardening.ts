import { QueuePublisher } from "@domain/queue"
import type { CustomBehaviorId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_GARDENING_THROTTLE_MS } from "../constants.ts"

export interface TriggerProjectGardeningInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly reason?: "manual" | "threshold"
}

export interface TriggerProjectGardeningResult {
  readonly queued: true
}

export const taxonomyGardenProjectDedupeKey = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}): string => `org:${input.organizationId}:taxonomy:gardenProject:${input.projectId}`

/** Temporal workflow id / queue dedupe key for a single custom behavior's scoped regeneration. */
export const taxonomyGardenCustomBehaviorDedupeKey = (input: {
  readonly organizationId: OrganizationId
  readonly customBehaviorId: CustomBehaviorId
}): string => `org:${input.organizationId}:taxonomy:gardenCustomBehavior:${input.customBehaviorId}`

export const triggerProjectGardeningUseCase = (input: TriggerProjectGardeningInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const publisher = yield* QueuePublisher
    yield* publisher.publish(
      "taxonomy",
      "gardenProject",
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        reason: input.reason ?? "manual",
      },
      {
        dedupeKey: taxonomyGardenProjectDedupeKey(input),
        throttleMs: TAXONOMY_GARDENING_THROTTLE_MS,
      },
    )
    return { queued: true } satisfies TriggerProjectGardeningResult
  }).pipe(Effect.withSpan("taxonomy.triggerProjectGardening"))
