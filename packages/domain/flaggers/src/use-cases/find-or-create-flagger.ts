import type { ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { FlaggerSlug } from "../flagger-strategies/types.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"

export interface FindOrCreateFlaggerInput {
  readonly projectId: ProjectId
  readonly slug: FlaggerSlug
}

export type FindOrCreateFlaggerError = RepositoryError

/**
 * Returns the project's flagger row for `slug`, creating it with default
 * `enabled`/`sampling` when the project was never provisioned that strategy
 * (e.g. a flagger that shipped after the project existed). Idempotent via the
 * repository's `(organization_id, project_id, slug)` unique index, so it is
 * safe to run inside the update transaction and under concurrent callers.
 */
export const findOrCreateFlaggerUseCase = Effect.fn("flaggers.findOrCreateFlagger")(function* (
  input: FindOrCreateFlaggerInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.slug", input.slug)

  const repository = yield* FlaggerRepository

  const existing = yield* repository.findByProjectAndSlug({ projectId: input.projectId, slug: input.slug })
  if (existing) return existing

  const [created] = yield* repository.saveManyForProject({ projectId: input.projectId, slugs: [input.slug] })
  if (created) return created

  // Lost the insert race to a concurrent writer: the conflicting insert was
  // ignored, so re-read the row that now exists.
  return yield* repository.findByProjectAndSlug({ projectId: input.projectId, slug: input.slug })
})
