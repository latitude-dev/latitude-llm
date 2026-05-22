import type { NotificationGroup, RepositoryError, SlackIntegrationId, SqlClient } from "@domain/shared"
import { Data, Effect } from "effect"
import type { SlackRoute } from "../entities/slack-route.ts"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"

export interface ConfigureSlackRouteInput {
  readonly integrationId: SlackIntegrationId
  readonly group: NotificationGroup
  readonly routes: readonly SlackRoute[]
}

export class SlackRouteValidationError extends Data.TaggedError("SlackRouteValidationError")<{
  readonly reason: "duplicate-channel" | "empty-channel-id"
}> {
  override get message() {
    return `Invalid Slack route input: ${this.reason}`
  }
}

export class SlackIntegrationNotFoundError extends Data.TaggedError("SlackIntegrationNotFoundError")<{
  readonly integrationId: SlackIntegrationId
}> {
  override get message() {
    return `Slack integration not found or not active for the current org`
  }
}

/**
 * Replace every route configured for `group` on the active integration
 * with the supplied list. Empty input clears the group (equivalent to
 * `removeSlackRouteUseCase`). The routes payload is written verbatim —
 * the caller is responsible for filtering to channels the bot can
 * actually reach (the UI uses `listSlackChannelsUseCase`).
 */
export const configureSlackRouteUseCase = (
  input: ConfigureSlackRouteInput,
): Effect.Effect<
  void,
  SlackRouteValidationError | SlackIntegrationNotFoundError | RepositoryError,
  SqlClient | SlackIntegrationRepository
> =>
  Effect.gen(function* () {
    const seen = new Set<string>()
    for (const route of input.routes) {
      if (route.channelId.length === 0) {
        return yield* Effect.fail(new SlackRouteValidationError({ reason: "empty-channel-id" }))
      }
      if (seen.has(route.channelId)) {
        return yield* Effect.fail(new SlackRouteValidationError({ reason: "duplicate-channel" }))
      }
      seen.add(route.channelId)
    }

    const repo = yield* SlackIntegrationRepository
    const updated = yield* repo.updateRoutes(input.integrationId, input.group, input.routes)
    if (!updated) {
      return yield* Effect.fail(new SlackIntegrationNotFoundError({ integrationId: input.integrationId }))
    }
  })
