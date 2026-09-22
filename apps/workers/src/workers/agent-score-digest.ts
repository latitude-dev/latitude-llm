import { agentScoreDigestWindow } from "@domain/agent-score"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import {
  AdminFeatureFlagRepositoryLive,
  AgentScoreDigestSourceLive,
  type PostgresClient,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { fanOutAgentScoreDigest } from "./agent-score-digest-fan-out.ts"

const logger = createLogger("agent-score-digest")

interface AgentScoreDigestWorkerDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  /** Admin (RLS-bypassing) connection — the eligibility read spans organisations. */
  readonly adminPostgresClient: PostgresClient
}

export const createAgentScoreDigestWorker = ({
  consumer,
  publisher,
  adminPostgresClient,
}: AgentScoreDigestWorkerDeps) => {
  consumer.subscribe("agent-score-digest", {
    triggerWeeklyRun: () => {
      const { from, to } = agentScoreDigestWindow(new Date())

      return fanOutAgentScoreDigest({
        publish: (payload) =>
          publisher.publish("notifications", "request-agent-score-digest-notifications", payload, {
            dedupeKey: `notifications:request-agent-score-digest:${payload.projectId}:${payload.windowEnd}`,
          }),
      })({ windowStart: from, windowEnd: to }).pipe(
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              result.status === "fanned-out"
                ? `agent-score-digest: fan-out for ${result.publishedCount} project(s) over ${from}..${to}`
                : `agent-score-digest: nothing to send over ${from}..${to} (${result.status})`,
            ),
          ),
        ),
        Effect.tapError((error) => Effect.sync(() => logger.error("agent-score-digest weekly run failed", error))),
        withPostgres(Layer.mergeAll(AdminFeatureFlagRepositoryLive, AgentScoreDigestSourceLive), adminPostgresClient),
        withTracing,
        Effect.asVoid,
      )
    },
  })
}
