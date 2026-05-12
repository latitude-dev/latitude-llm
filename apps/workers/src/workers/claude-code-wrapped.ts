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
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("claude-code-wrapped")

const WINDOW_DURATION_MS = 7 * 24 * 60 * 60 * 1000

const dayKey = (date: Date): string => date.toISOString().slice(0, 10)

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
      const windowKey = dayKey(windowStart)

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

        yield* Effect.forEach(
          eligible,
          (project) =>
            publisher.publish(
              "claude-code-wrapped",
              "runForProject",
              {
                organizationId: project.organizationId as string,
                projectId: project.projectId as string,
                windowStartIso,
                windowEndIso,
              },
              { dedupeKey: `cc-wrapped:${project.projectId}:${windowKey}` },
            ),
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
        renderEmail: ({ userName, report }) =>
          claudeCodeWrappedTemplate({
            userName,
            projectName: report.project.name,
            windowStart: report.window.start,
            windowEnd: report.window.end,
            totalSessions: report.totals.sessions,
          }),
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
