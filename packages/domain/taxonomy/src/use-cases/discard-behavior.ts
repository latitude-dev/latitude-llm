import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
import { deleteCustomBehavior } from "./delete-custom-behavior.ts"

export interface DiscardBehaviorInput {
  /** The behavior's whole-project view (custom behavior). */
  readonly customBehaviorId: CustomBehaviorId
}

/**
 * Throw a behavior away after stopping or refining it. Identical to deleting one, so
 * it IS deleting one: keeping a second teardown here is what let Stop clean up more
 * than Delete did (Delete dropped only the `custom_behaviors` row, stranding the
 * scoped tree). The caller MUST terminate the in-flight garden workflow first.
 */
export const discardBehavior = (input: DiscardBehaviorInput) =>
  deleteCustomBehavior({ id: input.customBehaviorId }).pipe(Effect.withSpan("taxonomy.discardBehavior"))
