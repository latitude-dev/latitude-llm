import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"

export const getCustomBehavior = Effect.fn("taxonomy.getCustomBehavior")(function* (input: {
  readonly id: CustomBehaviorId
}) {
  yield* Effect.annotateCurrentSpan("customBehaviorId", input.id)

  const repo = yield* CustomBehaviorRepository
  return yield* repo.findById(input.id)
})
