import type { NotificationGroup, RepositoryError, SlackIntegrationId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"
import { SlackIntegrationNotFoundError } from "./configure-slack-route.ts"

export interface RemoveSlackRouteInput {
  readonly integrationId: SlackIntegrationId
  readonly group: NotificationGroup
}

/**
 * Clears every route configured for `group` on the active integration.
 * Effectively `configureSlackRoute(..., routes: [])`, expressed as its
 * own use case so callers can be explicit about intent.
 */
export const removeSlackRouteUseCase = (
  input: RemoveSlackRouteInput,
): Effect.Effect<void, SlackIntegrationNotFoundError | RepositoryError, SqlClient | SlackIntegrationRepository> =>
  Effect.gen(function* () {
    const repo = yield* SlackIntegrationRepository
    const updated = yield* repo.updateRoutes(input.integrationId, input.group, [])
    if (!updated) {
      return yield* Effect.fail(new SlackIntegrationNotFoundError({ integrationId: input.integrationId }))
    }
  })
