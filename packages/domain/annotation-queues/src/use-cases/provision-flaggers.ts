import type { ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Flagger } from "../entities/flagger.ts"
import { listQueueStrategySlugs } from "../flagger-strategies/index.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"

export interface ProvisionFlaggersInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export type ProvisionFlaggersError = RepositoryError

/**
 * Idempotently provisions one flagger row per registered strategy slug for a project.
 *
 * Default values come from the entity (`enabled = true`, `sampling = FLAGGER_DEFAULT_SAMPLING`).
 * Safe for concurrent calls: the underlying repository upserts via the
 * `(organization_id, project_id, slug)` unique index.
 */
export const provisionFlaggersUseCase = Effect.fn("annotationQueues.provisionFlaggers")(function* (
  input: ProvisionFlaggersInput,
) {
  yield* Effect.annotateCurrentSpan("flaggers.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flaggers.projectId", input.projectId)

  const repository = yield* FlaggerRepository
  const slugs = listQueueStrategySlugs()

  const rows = yield* repository.saveManyForProject({
    projectId: input.projectId,
    slugs,
  })

  return rows satisfies readonly Flagger[]
})
