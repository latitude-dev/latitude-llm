import type { WorkflowStarterShape } from "@domain/queue"
import { WorkflowAlreadyStartedError } from "@domain/queue"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createAgentScoreWorker } from "./agent-score.ts"

const unusedPublisher = {
  publish: () => Effect.die("publish should not be called by snapshotProject"),
  scheduleRepeatable: () => Effect.die("scheduleRepeatable should not be called"),
  close: () => Effect.void,
}

const unusedClickHouseClient = {} as ClickHouseClient

const createWorker = (workflowStarter: WorkflowStarterShape) => {
  const consumer = new TestQueueConsumer()
  createAgentScoreWorker({
    consumer,
    publisher: unusedPublisher,
    clickhouseClient: unusedClickHouseClient,
    workflowStarter,
  })
  return consumer
}

describe("createAgentScoreWorker", () => {
  it("starts a date-scoped Temporal workflow", async () => {
    const starts: unknown[] = []
    const consumer = createWorker({
      start: (workflow, input, options) =>
        Effect.sync(() => {
          starts.push({ workflow, input, options })
        }),
      signalWithStart: () => Effect.die("signalWithStart should not be called"),
    })
    const payload = {
      organizationId: "org-1",
      projectId: "project-1",
      date: "2026-09-18",
      force: true,
    }

    await consumer.dispatchTask("agent-score", "snapshotProject", payload)

    expect(starts).toEqual([
      {
        workflow: "agentScoreSnapshotWorkflow",
        input: payload,
        options: { workflowId: "agent-score:org-1:project-1:2026-09-18:force:date-cutoff" },
      },
    ])
  })

  it("keeps a forced refresh distinct from a scheduled snapshot", async () => {
    const workflowIds: string[] = []
    const consumer = createWorker({
      start: (_workflow, _input, options) =>
        Effect.sync(() => {
          workflowIds.push(options.workflowId)
        }),
      signalWithStart: () => Effect.die("signalWithStart should not be called"),
    })
    const scope = { organizationId: "org-1", projectId: "project-1", date: "2026-09-18" }

    await consumer.dispatchTask("agent-score", "snapshotProject", {
      ...scope,
      to: "2026-09-19T00:00:00.000Z",
    })
    await consumer.dispatchTask("agent-score", "snapshotProject", { ...scope, force: true })

    expect(workflowIds).toEqual([
      "agent-score:org-1:project-1:2026-09-18:scheduled",
      "agent-score:org-1:project-1:2026-09-18:force:date-cutoff",
    ])
  })

  it("treats an already-running workflow as success", async () => {
    const consumer = createWorker({
      start: (workflow, _input, options) =>
        Effect.fail(new WorkflowAlreadyStartedError({ workflow, workflowId: options.workflowId })),
      signalWithStart: () => Effect.die("signalWithStart should not be called"),
    })

    await expect(
      consumer.dispatchTask("agent-score", "snapshotProject", {
        organizationId: "org-1",
        projectId: "project-1",
        date: "2026-09-18",
      }),
    ).resolves.toBeUndefined()
  })
})
