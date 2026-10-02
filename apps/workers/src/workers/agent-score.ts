import { agentScoreSnapshotWorkflowId, resolveLaunchArtifacts, utcDateOf } from "@domain/agent-score"
import { resolveGenerationConfig } from "@domain/ai"
import { FLAGGER_DEFAULT_CLASSIFIER_MODEL } from "@domain/flaggers"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { ScoreProjectSweepSourceLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"
import { fanOutAgentScoreSweep } from "./agent-score-sweep.ts"

const logger = createLogger("agent-score")

interface AgentScoreWorkerDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly clickhouseClient: ClickHouseClient
  readonly workflowStarter: WorkflowStarterShape
}

export const createAgentScoreWorker = ({
  consumer,
  publisher,
  clickhouseClient,
  workflowStarter,
}: AgentScoreWorkerDeps) => {
  // One judge for the whole run: it decides the scoring version, and a version that varied per
  // project would make two projects' numbers incomparable for a reason neither of them chose.
  const judge = Effect.runSync(resolveGenerationConfig("FLAGGER_CLASSIFIER", FLAGGER_DEFAULT_CLASSIFIER_MODEL))
  const artifacts = resolveLaunchArtifacts({ judge })

  consumer.subscribe("agent-score", {
    sweep: () => {
      const now = new Date()
      const date = utcDateOf(now)

      return fanOutAgentScoreSweep({
        publish: (payload) => publisher.publish("agent-score", "snapshotProject", payload),
      })({
        date,
        to: now,
        maxStepDays: Math.max(...artifacts.agentScore.window.stepDays),
        sessionFloor: artifacts.agentScore.window.sessionFloor,
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              result.status === "fanned-out"
                ? `agent-score: fan-out for ${result.publishedCount} project(s) on ${date}`
                : `agent-score: no project reached the session floor on ${date}`,
            ),
          ),
        ),
        Effect.tapError((error) => Effect.sync(() => logger.error("agent-score sweep failed", error))),
        // Cross-organisation by design: the sweep has to see every project to decide who gets a task.
        withClickHouse(ScoreProjectSweepSourceLive, clickhouseClient, OrganizationId("system")),
        withTracing,
        Effect.asVoid,
      )
    },

    snapshotProject: (payload) =>
      workflowStarter
        .start("agentScoreSnapshotWorkflow", payload, {
          workflowId: agentScoreSnapshotWorkflowId(payload),
        })
        .pipe(
          Effect.catchTag("WorkflowAlreadyStartedError", () => Effect.void),
          Effect.tap(() =>
            Effect.sync(() =>
              logger.info("Agent Score snapshot workflow started", {
                organizationId: payload.organizationId,
                projectId: payload.projectId,
                date: payload.date,
              }),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error("Agent Score snapshot workflow start failed", {
                organizationId: payload.organizationId,
                projectId: payload.projectId,
                date: payload.date,
                error,
              }),
            ),
          ),
          withTracing,
          Effect.asVoid,
        ),
  })
}
