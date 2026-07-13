import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"

export const listCustomBehaviors = Effect.fn("taxonomy.listCustomBehaviors")(function* (input: {
  readonly projectId: ProjectId
}) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const repo = yield* CustomBehaviorRepository
  return yield* repo.listByProject({ projectId: input.projectId })
})
