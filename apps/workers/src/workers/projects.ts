import { OutboxEventWriter } from "@domain/events"
import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"
import { provisionFlaggers, provisionSystemMonitors } from "../services/provisioning.ts"

const logger = createLogger("projects")

class FirstTraceUpdateError extends Data.TaggedError("FirstTraceUpdateError")<{
  readonly cause: unknown
}> {}

interface ProjectsDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
}

export const createProjectsWorker = ({ consumer, postgresClient }: ProjectsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()

  consumer.subscribe("projects", {
    provision: (payload) =>
      Effect.gen(function* () {
        const startTime = Date.now()

        const results = yield* Effect.promise(() =>
          provisionFlaggers({
            organizationId: payload.organizationId,
            projectId: payload.projectId,
          }),
        )

        // System monitors are provisioned for every project regardless of the
        // `monitors` flag: the rows are inert until firing/UI gates open, and
        // provisioning up-front makes the eventual flag flip seamless.
        const monitors = yield* Effect.promise(() =>
          provisionSystemMonitors({
            organizationId: payload.organizationId,
            projectId: payload.projectId,
          }),
        )

        logger.info("Project provisioning completed", {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          durationMs: Date.now() - startTime,
          flaggersProvisioned: results.length,
          results: results.map((r) => r.slug),
          systemMonitorsProvisioned: monitors.length,
        })
      }).pipe(withTracing),

    checkFirstTrace: (payload) =>
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        const project = yield* repo.findById(ProjectId(payload.projectId))

        if (project.firstTraceAt) return

        // Resolve the org owner so the milestone is attributed to a real user
        // in analytics (see FirstTraceReceived payload docs — keeps it an
        // identified PostHog event so `$group_0` materializes). Best-effort:
        // a lookup failure falls back to no actor rather than dropping the
        // event. Prefer the owner, else the earliest member. This only runs on
        // the first trace per project (the fast-path return above gates it).
        const membershipRepo = yield* MembershipRepository
        const memberships = yield* membershipRepo
          .listByOrganizationId(OrganizationId(payload.organizationId))
          .pipe(Effect.orElseSucceed(() => []))
        const owner =
          memberships.find((m) => m.role === "owner") ??
          [...memberships].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]

        // Emit the milestone event. The fast-path check above + BullMQ's
        // per-projectId dedupeKey means this runs at most once per project
        // in practice (the dedupe TTL collapses concurrent spans).
        const outboxEventWriter = yield* OutboxEventWriter
        yield* outboxEventWriter.write({
          eventName: "FirstTraceReceived",
          aggregateType: "project",
          aggregateId: payload.projectId,
          organizationId: payload.organizationId,
          payload: {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
            ...(owner ? { actorUserId: owner.userId } : {}),
            ...(project.settings?.onboardingType ? { onboardingType: project.settings.onboardingType } : {}),
          },
        })

        // Mark the project so future checks are fast no-ops. This is
        // outside the outbox transaction — a crash between the two is
        // acceptable: the next TracesIngested check will re-emit the event
        // (PostHog dedupe absorbs it) and then set the column.
        yield* Effect.tryPromise({
          try: () =>
            pgClient.pool.query(
              "UPDATE latitude.projects SET first_trace_at = now() WHERE id = $1 AND first_trace_at IS NULL",
              [payload.projectId],
            ),
          catch: (cause) => new FirstTraceUpdateError({ cause }),
        })

        logger.info("First trace milestone recorded", {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive, MembershipRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withTracing,
        Effect.ignore,
      ),
  })
}
