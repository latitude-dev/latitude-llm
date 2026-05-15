import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { runWrappedUseCase } from "@domain/spans"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { ClaudeCodeSpanReaderLive, withClickHouse } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  AdminFeatureFlagRepositoryLive,
  FeatureFlagRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  WrappedReportRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { fanOutWeeklyRunUseCase } from "./wrapped-fan-out.ts"

const logger = createLogger("wrapped")

const WINDOW_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Resolves the public base URL of the web app. Used for the public
 * `/wrapped/<id>` share link threaded through the notification payload —
 * the rich email layout looks up the same URL via the renderer's ctx
 * when it builds CTAs.
 */
const resolveWebAppUrl = (): string => {
  const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  return webUrl.replace(/\/$/, "")
}

interface WrappedWorkerDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly adminPostgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
}

export const createWrappedWorker = ({
  consumer,
  publisher,
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
}: WrappedWorkerDeps) => {
  const webAppUrl = resolveWebAppUrl()

  consumer.subscribe("wrapped", {
    /**
     * Fired by the BullMQ repeatable schedule. Today the fan-out only
     * considers the `claude_code` type — when a second Wrapped type lands,
     * this becomes a per-type loop over a small in-memory registry.
     */
    triggerWeeklyRun: () => {
      const now = new Date()
      const windowStart = new Date(now.getTime() - WINDOW_DURATION_MS)

      // No dedupeKey on publish: BullMQ dedupe by jobId blocks legitimate
      // retries after a failed run (the failed jobId stays "burned" until
      // removed). The cron only fires weekly so there's no realistic
      // duplicate-publish risk from this path.
      return fanOutWeeklyRunUseCase({
        publish: (payload) => publisher.publish("wrapped", "runForProject", payload),
      })({ windowStart, windowEnd: now }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.status === "fanned-out") {
              logger.info(`wrapped: fan-out completed for ${result.publishedCount} project(s)`)
            } else if (result.status === "no-activity") {
              logger.info("wrapped: no projects had activity in window")
            } else {
              logger.info("wrapped: no eligible projects after flag intersection")
            }
          }),
        ),
        Effect.tapError((error) => Effect.sync(() => logger.error("wrapped triggerWeeklyRun failed", error))),
        // Admin postgres + ClickHouse — both default to the "system" org
        // sentinel so RLS / org filters are bypassed for cross-org reads.
        withPostgres(AdminFeatureFlagRepositoryLive, adminPostgresClient),
        withClickHouse(ClaudeCodeSpanReaderLive, clickhouseClient, OrganizationId("system")),
        withTracing,
        Effect.asVoid,
      )
    },

    /**
     * Per-project execution. Runs the use case under the org's SqlClient so
     * row-level security correctly scopes feature-flag and project queries.
     *
     * Today `payload.type` is always `"claude_code"`; the
     * `runWrappedUseCase` is hardcoded to that path. When a second type
     * lands, this becomes a registry dispatch keyed on `payload.type`.
     *
     * Two-step delivery: compute + persist the report here, then publish
     * a `request-wrapped-report-notifications` task. The notification
     * pipeline owns recipient resolution, per-user opt-out (via
     * `users.notification_preferences.wrapped_reports.email`), in-app
     * bell rows, and per-recipient email rendering+sending. The email
     * worker's `wrapped.report` renderer fetches this report's row via
     * `WrappedReportRepository` to produce the rich layout.
     */
    runForProject: (payload) => {
      const organizationId = OrganizationId(payload.organizationId)
      const projectId = ProjectId(payload.projectId)
      const windowStart = new Date(payload.windowStartIso)
      const windowEnd = new Date(payload.windowEndIso)

      return runWrappedUseCase({
        organizationId,
        projectId,
        windowStart,
        windowEnd,
      }).pipe(
        Effect.tap((result) =>
          Effect.gen(function* () {
            if (result.status !== "sent") {
              logger.info(`wrapped: skipped ${projectId} (${result.reason})`)
              return
            }
            logger.info(`wrapped: report persisted for ${projectId} (report ${result.reportId})`)
            // Hand off to the notification pipeline — it'll fan out to
            // org members, write bell rows, and (for opted-in users)
            // render + send the rich email via the per-kind renderer.
            // Dedupes via the queue's `dedupeKey` + the notifications
            // table's `(org, user, idempotency_key)` unique index, so
            // BullMQ retries can't produce duplicate notifications or
            // emails.
            yield* publisher
              .publish(
                "notifications",
                "request-wrapped-report-notifications",
                {
                  organizationId: payload.organizationId,
                  projectId: payload.projectId,
                  wrappedReportId: result.reportId,
                  link: `${webAppUrl}/wrapped/${result.reportId}`,
                },
                { dedupeKey: `notifications:request-wrapped:${result.reportId}` },
              )
              .pipe(
                Effect.tapError((cause) =>
                  Effect.sync(() => logger.error(`wrapped notification publish failed for ${projectId}`, cause)),
                ),
                Effect.ignore,
              )
          }),
        ),
        Effect.tapError((error) => Effect.sync(() => logger.error(`wrapped runForProject ${projectId} failed`, error))),
        withPostgres(
          Layer.mergeAll(
            FeatureFlagRepositoryLive,
            MembershipRepositoryLive,
            OrganizationRepositoryLive,
            ProjectRepositoryLive,
            WrappedReportRepositoryLive,
          ),
          postgresClient,
          organizationId,
        ),
        withClickHouse(ClaudeCodeSpanReaderLive, clickhouseClient, organizationId),
        withTracing,
        Effect.asVoid,
      )
    },
  })
}
