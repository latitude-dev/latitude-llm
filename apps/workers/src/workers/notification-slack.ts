import {
  type DispatchSlackOutcome,
  dispatchSlackNotificationUseCase,
  getOrRefreshBotTokenUseCase,
  SlackIntegrationRepository,
  type SlackMessenger,
  SlackMessengerError,
  type SlackRenderContext,
  SlackTokenRefreshError,
  SlackTokenRefresher,
} from "@domain/integrations"
import type { NotificationKind } from "@domain/notifications"
import { OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer } from "@domain/queue"
import { NotificationId, OrganizationId, ProjectId, SlackIntegrationId } from "@domain/shared"
import { type RedisClient, RedisSlackRefreshLockRepositoryLive } from "@platform/cache-redis"
import {
  IssueRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  SlackDeliveryRepositoryLive,
  SlackIntegrationRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import {
  loadSlackConfig,
  postMessage,
  SlackAuthError,
  SlackChannelGoneError,
  SlackRateLimitError,
  SlackTokenRefresherLive,
} from "@platform/slack"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("notification-slack")

interface NotificationSlackDeps {
  consumer: QueueConsumer
  redisClient: RedisClient
}

/**
 * Refresher layer for the on-use token refresh inside the worker. Built
 * once from env; when Slack credentials are absent we still provide a
 * (failing) layer so the use-case's type requirements are satisfied —
 * in practice fresh tokens take the fast path and never call it, and no
 * Slack jobs are produced without credentials anyway.
 */
const buildSlackRefresherLayer = () => {
  const config = Effect.runSync(loadSlackConfig.pipe(Effect.orElseSucceed(() => undefined)))
  if (config) return SlackTokenRefresherLive(config)
  return Layer.succeed(SlackTokenRefresher, {
    refresh: () => Effect.fail(new SlackTokenRefreshError({ reason: "transport" })),
  })
}

const repoLayer = Layer.mergeAll(
  IssueRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  SlackIntegrationRepositoryLive,
  SlackDeliveryRepositoryLive,
)

const resolveWebAppUrl = (): string => {
  const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  return webUrl.replace(/\/$/, "")
}

/**
 * Live `SlackMessenger` adapter — wraps `@platform/slack`'s `postMessage`
 * and maps its tagged errors into the use-case-facing `SlackMessengerError`
 * shape (so the use case stays free of platform deps).
 */
const messenger: SlackMessenger = {
  post: ({ botToken, channelId, text, blocks, color, threadTs, replyBroadcast }) =>
    postMessage({
      botToken,
      channelId,
      text,
      blocks: blocks as never,
      ...(color !== undefined ? { color } : {}),
      ...(threadTs !== undefined ? { threadTs, replyBroadcast: replyBroadcast === true } : {}),
    }).pipe(
      Effect.mapError((cause) => {
        if (cause instanceof SlackAuthError) {
          return new SlackMessengerError({ reason: "auth", cause })
        }
        if (cause instanceof SlackChannelGoneError) {
          return new SlackMessengerError({ reason: "channel-gone", cause })
        }
        if (cause instanceof SlackRateLimitError) {
          return new SlackMessengerError({
            reason: "rate-limited",
            retryAfterSec: cause.retryAfterSec,
            cause,
          })
        }
        return new SlackMessengerError({ reason: "transport", cause })
      }),
    ),
}

/**
 * Channel worker: consumes `notification-slack:send` tasks. One job per
 * `(occurrence, channel)`. Resolves the active integration for the org,
 * decrypts the bot token (read from the repo's `findActiveByOrganizationId`),
 * renders the per-kind block layout, and posts to the configured Slack
 * channel.
 *
 * Before posting it refreshes the rotated bot token on-use via
 * `getOrRefreshBotTokenUseCase` (single-flighted per workspace by the
 * refresh lock).
 *
 * Idempotency lives in the use case (claim-then-act against
 * `slack_deliveries`). Error policy:
 *
 *   - `auth` (token revoked/expired/invalid) → log, **ack** (no retry).
 *   - refresh chain broken (`invalid_refresh_token`) → log, **ack**; the
 *     integration must be reconnected (settings UI surfaces this).
 *   - `channel-gone` (not_in_channel, channel_not_found, archived) →
 *     log, **ack**. The route is orphaned — future UI work surfaces this.
 *   - `rate-limited` → throw to surface the Retry-After. BullMQ honours
 *     the backoff if the worker is configured to retry on throw.
 *   - render/invalid-payload → log, **ack** (retrying won't help).
 *   - transport/network → throw to retry (default BullMQ backoff).
 */
export const createNotificationSlackWorker = ({ consumer, redisClient }: NotificationSlackDeps) => {
  const webAppUrl = resolveWebAppUrl()
  const slackRefresherLayer = buildSlackRefresherLayer()

  consumer.subscribe("notification-slack", {
    send: (payload) => {
      const orgId = OrganizationId(payload.organizationId)
      const integrationId = SlackIntegrationId(payload.integrationId)
      const kind = payload.kind as NotificationKind

      return Effect.gen(function* () {
        const slackRepo = yield* SlackIntegrationRepository
        const integration = yield* slackRepo.findActiveByOrganizationId()
        if (!integration || integration.id !== integrationId) {
          logger.info(
            `notification-slack.send skipped — integration not active orgId=${orgId} integrationId=${integrationId}`,
          )
          return
        }
        // Dead refresh chain — nothing can be sent until the user
        // reconnects. Ack without attempting a refresh or send.
        if (integration.reconnectRequiredAt !== null) {
          logger.warn(
            `notification-slack.send skipped — integration needs reconnect orgId=${orgId} integrationId=${integrationId}`,
          )
          return
        }

        // Resolve render context. The org name is always present; the
        // project (if any) is best-effort — a deleted project shows
        // up as `null` and the renderer falls back to neutral copy.
        const orgRepo = yield* OrganizationRepository
        const organization = yield* orgRepo.findById(orgId)

        let project: SlackRenderContext["project"] = null
        if (payload.projectId !== null) {
          const projectRepo = yield* ProjectRepository
          project = yield* projectRepo.findById(payload.projectId).pipe(
            Effect.map((p) => ({ id: ProjectId(p.id), name: p.name, slug: p.slug })),
            Effect.orElseSucceed(() => null),
          )
        }

        const ctx: SlackRenderContext = {
          webAppUrl,
          organization: { id: orgId, name: organization.name },
          project,
          notificationId: payload.notificationId !== null ? NotificationId(payload.notificationId) : null,
        }

        // Refresh the rotated bot token first when it is at/near expiry.
        // Single-flighted per workspace by the refresh lock so a concurrent
        // sweep can't double-rotate.
        const botToken = yield* getOrRefreshBotTokenUseCase({ integration })

        // SlackMessengerError with reason "auth" or "channel-gone" → ack (skip retry).
        // SlackMessengerError with reason "rate-limited" or "transport" → propagate so BullMQ retries.
        // RenderSlackError → ack (re-rendering won't help).
        // RepositoryError → propagate so BullMQ retries.
        const dispatched = yield* dispatchSlackNotificationUseCase({
          integrationId,
          botToken,
          channelId: payload.channelId,
          kind,
          payload: payload.payload,
          idempotencyKey: payload.idempotencyKey,
          context: ctx,
          messenger,
        }).pipe(
          Effect.catchTag("SlackMessengerError", (e) => {
            if (e.reason === "rate-limited" || e.reason === "transport") {
              return Effect.fail(e)
            }
            logger.warn(
              `notification-slack.send acknowledged auth/channel error reason=${e.reason} channelId=${payload.channelId}`,
              e,
            )
            return Effect.succeed<DispatchSlackOutcome>({ status: "skipped-already-delivered" })
          }),
          Effect.catchTag("RenderSlackError", (e) => {
            logger.error(
              `notification-slack.send render failed kind=${kind} reason=${e.reason} channelId=${payload.channelId}`,
              e,
            )
            return Effect.succeed<DispatchSlackOutcome>({ status: "skipped-already-delivered" })
          }),
        )

        logger.info(`notification-slack.send orgId=${orgId} channelId=${payload.channelId} status=${dispatched.status}`)
      }).pipe(
        // A broken rotation chain (refresh token revoked) is terminal — the
        // integration must be reconnected — so ack without retry, mirroring
        // the "auth" policy above. Transient refresh failures fall through
        // and propagate so BullMQ retries.
        Effect.catchTag("SlackTokenRefreshError", (error) => {
          if (error.reason === "invalid_refresh_token") {
            logger.warn(
              `notification-slack.send acknowledged broken refresh chain; integration needs reconnect channelId=${payload.channelId}`,
              error,
            )
            return Effect.void
          }
          return Effect.fail(error)
        }),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(
              `notification-slack.send failed orgId=${orgId} channelId=${payload.channelId} key=${payload.idempotencyKey}`,
              error,
            ),
          ),
        ),
        withPostgres(repoLayer, getPostgresClient(), orgId),
        Effect.provide(slackRefresherLayer),
        Effect.provide(RedisSlackRefreshLockRepositoryLive(redisClient)),
        Effect.asVoid,
        withTracing,
      )
    },
  })
}
