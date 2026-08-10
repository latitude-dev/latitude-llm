import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
import { isCustomBehaviorView } from "../entities/custom-behavior.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { deleteCustomBehavior } from "./delete-custom-behavior.ts"

interface DeleteCustomBehaviorWithViewsInput {
  readonly id: CustomBehaviorId
  /** Termination reason recorded on each garden workflow, for Temporal history. */
  readonly reason?: string
}

/**
 * Delete a behavior, cascading to its lens's filtered views when the target is the
 * lens's whole-project behavior. A filtered view slices answers the whole-project
 * behavior extracted, so keeping one alive without it would leave a view with nothing
 * left to slice and no way for the user to reach its lens again.
 *
 * The lens's whole-project behavior goes last: {@link deleteCustomBehavior} tears the
 * lens (facet + extracted projections) down along with its final view, and that check
 * reads the behaviors still on the project — so the deletes run one at a time, and the
 * one that decides the lens's fate runs when every other view is already gone.
 */
export const deleteCustomBehaviorWithViews = Effect.fn("taxonomy.deleteCustomBehaviorWithViews")(function* (
  input: DeleteCustomBehaviorWithViewsInput,
) {
  yield* Effect.annotateCurrentSpan("customBehaviorId", input.id)

  const behaviors = yield* CustomBehaviorRepository
  const target = yield* behaviors.findById(input.id)
  const cascades = target.facetId != null && !isCustomBehaviorView(target)
  const views = cascades
    ? (yield* behaviors.listByProject({ projectId: target.projectId })).filter(
        (behavior) =>
          behavior.facetId === target.facetId && isCustomBehaviorView(behavior) && behavior.id !== target.id,
      )
    : []

  const reason = input.reason
  yield* Effect.forEach(
    [...views.map((view) => view.id), target.id],
    (id) => deleteCustomBehavior({ id, ...(reason !== undefined ? { reason } : {}) }),
    { discard: true },
  )

  return { deletedCount: views.length + 1 }
})
