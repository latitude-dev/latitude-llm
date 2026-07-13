import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"

export const deleteCustomBehavior = Effect.fn("taxonomy.deleteCustomBehavior")(function* (input: {
  readonly id: CustomBehaviorId
}) {
  yield* Effect.annotateCurrentSpan("customBehaviorId", input.id)

  const repo = yield* CustomBehaviorRepository
  // findById is org-scoped via RLS, so a cross-org (or missing) id surfaces
  // NotFoundError rather than silently no-op'ing the delete.
  yield* repo.findById(input.id)
  yield* repo.delete(input.id)
})
