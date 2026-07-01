import {
  AgentDispatchConfigRepository,
  type AgentDispatchKind,
  AgentDispatchTraceReader,
  type AgentDispatchTrigger,
  agentDispatchContextSchema,
  requestAgentDispatchUseCase,
  sendAgentDispatchUseCase,
} from "@domain/agent-dispatch"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId, SignalId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { AgentDispatchAdaptersLive } from "@platform/agent-dispatch"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AgentDispatchConfigRepositoryLive,
  AgentDispatchCredentialRepositoryLive,
  AgentDispatchRepositoryLive,
  FeatureFlagRepositoryLive,
  IncidentMonitorReaderLive,
  IncidentRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("agent-dispatch")

const resolveWebAppUrl = (): string => {
  const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  return webUrl.replace(/\/$/, "")
}

const requestLayer = Layer.mergeAll(
  AgentDispatchConfigRepositoryLive,
  IncidentMonitorReaderLive,
  IncidentRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  SignalRepositoryLive,
  ScoreRepositoryLive,
  FeatureFlagRepositoryLive,
)

const sendLayer = Layer.mergeAll(
  AgentDispatchConfigRepositoryLive,
  AgentDispatchRepositoryLive,
  AgentDispatchCredentialRepositoryLive,
)

const AgentDispatchTraceReaderLive = Layer.effect(
  AgentDispatchTraceReader,
  Effect.gen(function* () {
    const traces = yield* TraceRepository
    return AgentDispatchTraceReader.of({
      findMessagesByTraceId: (input) =>
        traces.findByTraceId(input).pipe(Effect.map((trace) => trace.allMessages as readonly unknown[])),
    })
  }),
)

export const createAgentDispatchWorker = ({
  consumer,
  publisher,
}: {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
}) => {
  const webAppUrl = resolveWebAppUrl()
  const pgClient = getPostgresClient()
  const chClient = getClickhouseClient()

  consumer.subscribe("agent-dispatch", {
    request: (payload) => {
      const orgId = OrganizationId(payload.organizationId)
      const source =
        payload.source === "signal"
          ? {
              type: "signal" as const,
              organizationId: orgId,
              projectId: ProjectId(payload.projectId!),
              signalId: SignalId(payload.signalId!),
            }
          : {
              type: "incident" as const,
              organizationId: orgId,
              alertIncidentId: payload.alertIncidentId!,
            }

      return requestAgentDispatchUseCase({ source, webAppUrl }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(`agent-dispatch.request skipped reason=${result.reason}`)
            return Effect.void
          }
          return Effect.forEach(result.requests, (request) =>
            publisher.publish(
              "agent-dispatch",
              "send",
              {
                organizationId: request.organizationId,
                projectId: request.projectId,
                configId: request.configId,
                integrationId: request.integrationId,
                kind: request.kind,
                idempotencyKey: request.idempotencyKey,
                trigger: request.trigger,
                sourceType: request.sourceType,
                sourceId: request.sourceId,
                prompt: request.prompt,
                context: request.context as Record<string, unknown>,
                target: {},
              },
              { dedupeKey: `agent-dispatch:send:${request.idempotencyKey}` },
            ),
          )
        }),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`agent-dispatch.request failed orgId=${orgId}`, error)),
        ),
        withPostgres(requestLayer, pgClient, orgId),
        withClickHouse(
          Layer.mergeAll(
            ScoreAnalyticsRepositoryLive,
            TraceRepositoryLive,
            AgentDispatchTraceReaderLive.pipe(Layer.provide(TraceRepositoryLive)),
          ),
          chClient,
          orgId,
        ),
        Effect.asVoid,
        withTracing,
      )
    },

    send: (payload) => {
      const orgId = OrganizationId(payload.organizationId)
      const projectId = ProjectId(payload.projectId)

      return Effect.gen(function* () {
        const configRepo = yield* AgentDispatchConfigRepository
        const config = yield* configRepo.findById(payload.configId)
        const context = agentDispatchContextSchema.parse(payload.context)

        const outcome = yield* sendAgentDispatchUseCase({
          configId: payload.configId,
          projectId,
          integrationId: payload.integrationId,
          kind: payload.kind as AgentDispatchKind,
          idempotencyKey: payload.idempotencyKey,
          trigger: payload.trigger as AgentDispatchTrigger,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          prompt: payload.prompt,
          context,
          target: { ...config.target, kind: config.kind },
        }).pipe(
          Effect.catchTag("DispatchAdapterError", (error) => {
            if (error.reason === "rate_limited" || error.reason === "transport") {
              return Effect.fail(error)
            }
            logger.warn(`agent-dispatch.send acknowledged error reason=${error.reason}`, error)
            return Effect.succeed({ status: "failed" as const, reason: error.reason })
          }),
        )

        logger.info(`agent-dispatch.send orgId=${orgId} status=${outcome.status}`)
      }).pipe(
        Effect.tapError((error) => Effect.sync(() => logger.error(`agent-dispatch.send failed orgId=${orgId}`, error))),
        withPostgres(sendLayer, pgClient, orgId),
        Effect.provide(AgentDispatchAdaptersLive),
        Effect.asVoid,
        withTracing,
      )
    },
  })
}
