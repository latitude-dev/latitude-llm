import {
  getOrRefreshBotTokenUseCase,
  SLACK_TOKEN_REFRESH_LOOKAHEAD_SECONDS,
  SlackIntegrationRepository,
  SlackTokenRefreshError,
  SlackTokenRefresher,
} from "@domain/integrations"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, SlackIntegrationId } from "@domain/shared"
import { type RedisClient, RedisSlackRefreshLockRepositoryLive } from "@platform/cache-redis"
import {
  listSlackIntegrationsNeedingRefreshAcrossOrgs,
  type PostgresClient,
  SlackIntegrationRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { loadSlackConfig, SlackTokenRefresherLive } from "@platform/slack"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("slack-token-refresh")

interface SlackTokenRefreshDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly adminPostgresClient: PostgresClient
  readonly redisClient: RedisClient
}

/**
 * Refresher layer built once from env. When Slack credentials are absent
 * we still provide a (failing) layer to satisfy the use-case's type
 * requirements; in practice no integrations exist without credentials.
 */
const buildSlackRefresherLayer = () => {
  const config = Effect.runSync(loadSlackConfig.pipe(Effect.orElseSucceed(() => undefined)))
  if (config) return SlackTokenRefresherLive(config)
  return Layer.succeed(SlackTokenRefresher, {
    refresh: () => Effect.fail(new SlackTokenRefreshError({ reason: "transport" })),
  })
}

/**
 * Scheduled Slack token-rotation sweep.
 *
 *  - `scan` (hourly cron): enumerate active rotating integrations whose
 *    token expires within the lookahead window — across all orgs, via
 *    the RLS-bypassing admin client — and fan out one `refreshIntegration`
 *    per match (deduped per integration, bounded BullMQ backoff).
 *  - `refreshIntegration`: refresh that one integration under its org's
 *    RLS scope via `getOrRefreshBotTokenUseCase`, passing the lookahead
 *    as the threshold so a token anywhere inside the window is renewed.
 *
 * Refresh-on-use (web + notification worker) remains the correctness
 * backstop; this sweep keeps tokens warm so an idle workspace's refresh
 * token never ages past Slack's validity window.
 */
export const createSlackTokenRefreshWorker = ({
  consumer,
  publisher,
  postgresClient,
  adminPostgresClient,
  redisClient,
}: SlackTokenRefreshDeps) => {
  const slackRefresherLayer = buildSlackRefresherLayer()

  consumer.subscribe("slack-token-refresh", {
    scan: () =>
      Effect.gen(function* () {
        const notAfter = new Date(Date.now() + SLACK_TOKEN_REFRESH_LOOKAHEAD_SECONDS * 1000)
        const due = yield* listSlackIntegrationsNeedingRefreshAcrossOrgs(adminPostgresClient.db, notAfter)

        let published = 0
        for (const row of due) {
          yield* publisher
            .publish(
              "slack-token-refresh",
              "refreshIntegration",
              { organizationId: row.organizationId, integrationId: row.id },
              {
                dedupeKey: `slack-token-refresh:${row.id}`,
                attempts: 3,
                backoff: { type: "exponential", delayMs: 30_000 },
              },
            )
            .pipe(
              Effect.tap(() => Effect.sync(() => published++)),
              // Isolate per-row publish failures so one bad row doesn't
              // abort the whole sweep.
              Effect.catch((error) =>
                Effect.sync(() =>
                  logger.warn(`slack-token-refresh.scan failed to enqueue integrationId=${row.id}`, error),
                ),
              ),
            )
        }

        logger.info(`slack-token-refresh.scan completed due=${due.length} published=${published}`)
      }).pipe(
        Effect.tapError((error) => Effect.sync(() => logger.error("slack-token-refresh.scan failed", error))),
        withTracing,
        Effect.withSpan("slackTokenRefresh.scan"),
        Effect.asVoid,
      ),

    refreshIntegration: (payload) => {
      const orgId = OrganizationId(payload.organizationId)
      const integrationId = SlackIntegrationId(payload.integrationId)

      return Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        const integration = yield* repo.findActiveByOrganizationId()
        if (!integration || integration.id !== integrationId) {
          logger.info(
            `slack-token-refresh.refreshIntegration skipped — not active orgId=${orgId} integrationId=${integrationId}`,
          )
          return
        }

        // Refresh anything inside the lookahead window (not just the
        // 5-min on-use skew) — this is the proactive warm-keeping path.
        yield* getOrRefreshBotTokenUseCase({
          integration,
          refreshIfExpiringWithinSeconds: SLACK_TOKEN_REFRESH_LOOKAHEAD_SECONDS,
        })
        logger.info(`slack-token-refresh.refreshIntegration done orgId=${orgId} integrationId=${integrationId}`)
      }).pipe(
        // Broken rotation chain → ack (retry won't help; needs reconnect).
        // Transient failures (transport / lock / cache / repo) propagate
        // so BullMQ retries with backoff.
        Effect.catchTag("SlackTokenRefreshError", (error) => {
          if (error.reason === "invalid_refresh_token") {
            logger.warn(
              `slack-token-refresh broken chain; integration needs reconnect orgId=${orgId} integrationId=${integrationId}`,
              error,
            )
            return Effect.void
          }
          return Effect.fail(error)
        }),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(
              `slack-token-refresh.refreshIntegration failed orgId=${orgId} integrationId=${integrationId}`,
              error,
            ),
          ),
        ),
        withPostgres(SlackIntegrationRepositoryLive, postgresClient, orgId),
        Effect.provide(slackRefresherLayer),
        Effect.provide(RedisSlackRefreshLockRepositoryLive(redisClient)),
        Effect.asVoid,
        withTracing,
        Effect.withSpan("slackTokenRefresh.refreshIntegration"),
      )
    },
  })
}
