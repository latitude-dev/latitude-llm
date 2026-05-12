import { claudeCodeWrappedTemplate, sendEmail } from "@domain/email"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { runClaudeCodeWrappedUseCase } from "@domain/spans"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { ClaudeCodeSpanReaderLive, withClickHouse } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  AdminFeatureFlagRepositoryLive,
  FeatureFlagRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { parseEnv } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { fanOutWeeklyRunUseCase } from "./claude-code-wrapped-fan-out.ts"

const logger = createLogger("claude-code-wrapped")

const WINDOW_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Resolves the public base URL of the web app. The template derives every
 * downstream link from this — personality PNGs (`/email-branding/…`), the
 * project deep-link (`/projects/<slug>`), the unsubscribe / settings page
 * (`/settings/account`), the Latitude logo (`/latitude-logo.png`).
 *
 * Same env var Better Auth, file uploads, and the auth config already use:
 * `http://localhost:3000` in dev, the deployment-specific host in
 * staging / prod.
 */
const resolveWebAppUrl = (): string => {
  const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  return webUrl.replace(/\/$/, "")
}

interface ClaudeCodeWrappedWorkerDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly adminPostgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
}

export const createClaudeCodeWrappedWorker = ({
  consumer,
  publisher,
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
}: ClaudeCodeWrappedWorkerDeps) => {
  const emailSender = createEmailTransportSender()
  const sendEmailUseCase = sendEmail({ emailSender })
  const webAppUrl = resolveWebAppUrl()

  consumer.subscribe("claude-code-wrapped", {
    /**
     * Fired by the BullMQ repeatable schedule. Lists every project with
     * Claude Code activity in the last 7 days, intersects with orgs that have
     * the `claude-code-wrapped` flag enabled (or globally on), and publishes
     * one `runForProject` task per surviving project.
     */
    triggerWeeklyRun: () => {
      const now = new Date()
      const windowStart = new Date(now.getTime() - WINDOW_DURATION_MS)

      // No dedupeKey on publish: BullMQ dedupe by jobId blocks legitimate
      // retries after a failed run (the failed jobId stays "burned" until
      // removed). The cron only fires weekly so there's no realistic
      // duplicate-publish risk from this path.
      return fanOutWeeklyRunUseCase({
        publish: (payload) => publisher.publish("claude-code-wrapped", "runForProject", payload),
      })({ windowStart, windowEnd: now }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.status === "fanned-out") {
              logger.info(`claude-code-wrapped: fan-out completed for ${result.publishedCount} project(s)`)
            } else if (result.status === "no-activity") {
              logger.info("claude-code-wrapped: no projects had Claude Code activity in window")
            } else {
              logger.info("claude-code-wrapped: no eligible projects after flag intersection")
            }
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error("claude-code-wrapped triggerWeeklyRun failed", error)),
        ),
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
     */
    runForProject: (payload) => {
      const organizationId = OrganizationId(payload.organizationId)
      const projectId = ProjectId(payload.projectId)
      const windowStart = new Date(payload.windowStartIso)
      const windowEnd = new Date(payload.windowEndIso)

      return runClaudeCodeWrappedUseCase({
        renderEmail: ({ userName, report }) => claudeCodeWrappedTemplate({ userName, report, webAppUrl }),
        sendEmail: sendEmailUseCase,
      })({
        organizationId,
        projectId,
        windowStart,
        windowEnd,
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.status === "sent") {
              logger.info(`claude-code-wrapped: sent to ${result.recipientCount} recipient(s) for ${projectId}`)
            } else {
              logger.info(`claude-code-wrapped: skipped ${projectId} (${result.reason})`)
            }
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`claude-code-wrapped runForProject ${projectId} failed`, error)),
        ),
        withPostgres(
          Layer.mergeAll(
            FeatureFlagRepositoryLive,
            MembershipRepositoryLive,
            OrganizationRepositoryLive,
            ProjectRepositoryLive,
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
