import { OutboxEventWriter } from "@domain/events"
import { type ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { FlaggerSlug } from "../flagger-strategies/types.ts"
import { FLAGGER_STRATEGY_SLUGS } from "../flagger-strategies/types.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { evictProjectFlaggersUseCase } from "./get-project-flaggers.ts"
import { provisionFlaggersUseCase } from "./provision-flaggers.ts"

export interface ConfigureProjectFlaggersForOnboardingInput {
  readonly organizationId: string
  readonly projectId: ProjectId
  readonly enabledSlugs: readonly FlaggerSlug[]
  readonly actorUserId: string
}

export type ConfigureProjectFlaggersForOnboardingError = RepositoryError

/**
 * Defensively provisions project flaggers and applies the onboarding enabled
 * selection in one transaction. Provisioning is idempotent, so racing with the
 * background ProjectCreated worker cannot create duplicates; the bulk update
 * runs after provisioning so the user's onboarding choices win.
 */
export const configureProjectFlaggersForOnboardingUseCase = Effect.fn("flaggers.configureProjectFlaggersForOnboarding")(
  function* (input: ConfigureProjectFlaggersForOnboardingInput) {
    yield* Effect.annotateCurrentSpan("flaggers.organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("flaggers.projectId", input.projectId)

    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* provisionFlaggersUseCase({ organizationId: input.organizationId, projectId: input.projectId })

        const repository = yield* FlaggerRepository
        const updatedRows = yield* repository.updateEnabledForProject({
          projectId: input.projectId,
          slugs: FLAGGER_STRATEGY_SLUGS,
          enabledSlugs: input.enabledSlugs,
        })

        const outboxEventWriter = yield* OutboxEventWriter
        for (const row of updatedRows) {
          yield* outboxEventWriter.write({
            eventName: "FlaggerToggled",
            aggregateType: "flagger",
            aggregateId: row.id,
            organizationId: input.organizationId,
            payload: {
              organizationId: input.organizationId,
              actorUserId: input.actorUserId,
              projectId: input.projectId,
              flaggerSlug: row.slug,
              enabled: row.enabled,
              sampling: row.sampling,
            },
          })
        }
      }),
    )

    // Evict after commit so a concurrent reader cannot repopulate the cache with
    // stale values between eviction and commit.
    yield* evictProjectFlaggersUseCase({ organizationId: input.organizationId, projectId: input.projectId })
  },
)
