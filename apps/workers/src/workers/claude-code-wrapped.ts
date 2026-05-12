import { AdminFeatureFlagRepository } from "@domain/admin"
import { claudeCodeWrappedTemplate, sendEmail } from "@domain/email"
import { CLAUDE_CODE_WRAPPED_FLAG } from "@domain/feature-flags"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { listProjectsWithClaudeCodeSpansUseCase, runClaudeCodeWrappedUseCase } from "@domain/spans"
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

const logger = createLogger("claude-code-wrapped")

const WINDOW_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Resolves the base URL for the personality PNGs. The PNGs live under
 * `apps/web/public/email-branding/claude-code-wrapped/personalities/` and are
 * served directly by the web app, so the prefix is whatever `LAT_WEB_URL`
 * points at (localhost:3000 in dev, the deployment-specific host in
 * staging/prod — same env var Better Auth, file uploads, and the auth
 * config already use).
 */
const resolveImageBaseUrl = (): string => {
  const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  return `${webUrl.replace(/\/$/, "")}/email-branding/claude-code-wrapped/personalities`
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
  const imageBaseUrl = resolveImageBaseUrl()

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

      return Effect.gen(function* () {
        const projects = yield* listProjectsWithClaudeCodeSpansUseCase({ from: windowStart, to: now })
        if (projects.length === 0) {
          logger.info("claude-code-wrapped: no projects had Claude Code activity in window")
          return
        }

        const adminFlags = yield* AdminFeatureFlagRepository
        const eligibility = yield* adminFlags.findEligibilityForFlag(CLAUDE_CODE_WRAPPED_FLAG)

        const enabledOrgIds = new Set(eligibility.organizationIds.map((id) => id as string))
        const eligible = eligibility.enabledForAll
          ? projects
          : projects.filter((project) => enabledOrgIds.has(project.organizationId as string))

        if (eligible.length === 0) {
          logger.info("claude-code-wrapped: no eligible projects after flag intersection")
          return
        }

        const windowStartIso = windowStart.toISOString()
        const windowEndIso = now.toISOString()

        // No dedupeKey: BullMQ dedupe by jobId blocks legitimate retries after
        // a failed run (the failed jobId stays "burned" until removed). The
        // cron only fires weekly so there's no realistic duplicate-publish
        // risk from this path, and the manual backoffice button should
        // always re-run on click.
        yield* Effect.forEach(
          eligible,
          (project) =>
            publisher.publish("claude-code-wrapped", "runForProject", {
              organizationId: project.organizationId as string,
              projectId: project.projectId as string,
              windowStartIso,
              windowEndIso,
            }),
          { concurrency: 10, discard: true },
        )

        logger.info(`claude-code-wrapped: fan-out completed for ${eligible.length} project(s)`)
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => logger.error("claude-code-wrapped triggerWeeklyRun failed", error)),
        ),
        // Admin postgres + ClickHouse — both default to the "system" org
        // sentinel so RLS / org filters are bypassed for cross-org reads.
        withPostgres(AdminFeatureFlagRepositoryLive, adminPostgresClient),
        withClickHouse(ClaudeCodeSpanReaderLive, clickhouseClient, OrganizationId("system")),
        withTracing,
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
        renderEmail: ({ userName, report }) => claudeCodeWrappedTemplate({ userName, report, imageBaseUrl }),
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
