import type { ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Flagger } from "../entities/flagger.ts"
// Import slugs from the lightweight types module, not the strategy registry:
// the registry drags every strategy's system prompt, which bloats the web
// bundle when the onboarding server function reaches this use-case.
import { FLAGGER_STRATEGY_SLUGS } from "../flagger-strategies/types.ts"
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
export const provisionFlaggersUseCase = Effect.fn("flaggers.provisionFlaggers")(function* (
  input: ProvisionFlaggersInput,
) {
  yield* Effect.annotateCurrentSpan("flaggers.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flaggers.projectId", input.projectId)

  const repository = yield* FlaggerRepository
  const slugs = FLAGGER_STRATEGY_SLUGS

  const rows = yield* repository.saveManyForProject({
    projectId: input.projectId,
    slugs,
  })

  return rows satisfies readonly Flagger[]
})
