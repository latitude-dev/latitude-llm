import type { ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Flagger } from "../entities/flagger.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"

export interface UpdateFlaggerInput {
  readonly projectId: ProjectId
  readonly slug: string
  readonly enabled: boolean
}

export type UpdateFlaggerError = RepositoryError

export const updateFlaggerUseCase = Effect.fn("annotationQueues.updateFlagger")(function* (input: UpdateFlaggerInput) {
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.slug", input.slug)

  const repository = yield* FlaggerRepository
  return (yield* repository.update(input)) satisfies Flagger | null
})
