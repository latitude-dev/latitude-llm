import { OutboxEventWriter } from "@domain/events"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { OutboxEventWriterLive, type PostgresClient, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"
import { provisionSystemQueues } from "../services/provisioning.ts"

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
          provisionSystemQueues({
            organizationId: payload.organizationId,
            projectId: payload.projectId,
          }),
        )

        logger.info("Project provisioning completed", {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          durationMs: Date.now() - startTime,
          queuesProvisioned: results.length,
          results: results.map((r) => r.queueSlug),
        })
      }).pipe(withTracing),

    checkFirstTrace: (payload) =>
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        const project = yield* repo.findById(ProjectId(payload.projectId))

        if (project.firstTraceAt) return

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
          },
        })

        // Mark the project so future checks are fast no-ops. This is
        // outside the outbox transaction — a crash between the two is
        // acceptable: the next SpanIngested check will re-emit the event
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
          Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withTracing,
        Effect.ignore,
      ),
  })
}
