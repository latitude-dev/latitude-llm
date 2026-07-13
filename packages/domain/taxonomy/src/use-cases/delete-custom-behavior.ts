import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"

export const deleteCustomBehavior = Effect.fn("taxonomy.deleteCustomBehavior")(function* (input: {
  readonly id: CustomBehaviorId
}) {
  yield* Effect.annotateCurrentSpan("customBehaviorId", input.id)

  const repo = yield* CustomBehaviorRepository
  // findById is org-scoped, so a cross-org/missing id surfaces NotFoundError instead of a silent no-op.
  yield* repo.findById(input.id)
  yield* repo.delete(input.id)
})
