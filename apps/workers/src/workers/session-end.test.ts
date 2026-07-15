import type { WorkflowStarterShape } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { createRunHandler, createSessionEndWorker, runSessionEndJob } from "./session-end.ts"

const ORGANIZATION_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)
const SESSION_ID = "session-1"
const LATEST_TRACE_ID = "t".repeat(32)
const LATEST_TRACE_START_TIME = new Date("2026-04-15T12:00:00.000Z").toISOString()

const createFakeWorkflowStarter = () => {
  const started: Array<{
    readonly workflow: string
    readonly input: unknown
    readonly options: unknown
    readonly mode: "start" | "signalWithStart"
  }> = []
  const workflowStarter: WorkflowStarterShape = {
    start: (workflow, input, options) =>
      Effect.sync(() => {
        started.push({ workflow, input, options, mode: "start" })
      }) as never,
    signalWithStart: (workflow, input, options) =>
      Effect.sync(() => {
        started.push({ workflow, input, options, mode: "signalWithStart" })
      }),
  }
  return { workflowStarter, started }
}

const payload = {
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  sessionId: SESSION_ID,
  latestTraceId: LATEST_TRACE_ID,
  latestTraceStartTime: LATEST_TRACE_START_TIME,
}

describe("createSessionEndWorker", () => {
  it("registers the session-end run task", () => {
    const consumer = new TestQueueConsumer()
    const { publisher } = createFakeQueuePublisher()
    const { workflowStarter } = createFakeWorkflowStarter()

    createSessionEndWorker({ consumer, publisher, workflowStarter })

    expect(consumer.getRegisteredTasks("session-end")).toEqual(["run"])
  })
})

describe("runSessionEndJob", () => {
  it("skips all work for sandbox sessions", async () => {
    const { publisher, published } = createFakeQueuePublisher()
    const { workflowStarter, started } = createFakeWorkflowStarter()

    const result = await Effect.runPromise(
      runSessionEndJob({ publisher, workflowStarter })({ ...payload, isSandbox: true }),
    )

    expect(result).toEqual({ action: "skipped", reason: "sandbox", sessionId: SESSION_ID })
    expect(published).toEqual([])
    expect(started).toEqual([])
  })

  it("matches signals against the latest trace and signals the session analysis workflow", async () => {
    const { publisher, published } = createFakeQueuePublisher()
    const { workflowStarter, started } = createFakeWorkflowStarter()

    const result = await Effect.runPromise(runSessionEndJob({ publisher, workflowStarter })(payload))

    expect(result).toEqual({
      action: "completed",
      sessionId: SESSION_ID,
      latestTraceId: LATEST_TRACE_ID,
    })

    const signalsMatchPublish = published.find((p) => p.queue === "signals")
    expect(signalsMatchPublish?.task).toBe("match")
    expect(signalsMatchPublish?.payload).toMatchObject({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      traceId: LATEST_TRACE_ID,
      reason: "ingest",
    })
    expect(signalsMatchPublish?.options).toMatchObject({
      dedupeKey: `org:${ORGANIZATION_ID}:signals-match:${PROJECT_ID}:${LATEST_TRACE_ID}`,
    })

    expect(started).toEqual([
      {
        workflow: "analyzeSessionWorkflow",
        mode: "signalWithStart",
        input: {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          sessionId: SESSION_ID,
          triggeringTraceId: LATEST_TRACE_ID,
          triggeringStartTime: LATEST_TRACE_START_TIME,
          reason: "trace_completed",
        },
        options: {
          workflowId: `org:${ORGANIZATION_ID}:conversation-intelligence:analyzeSession:${PROJECT_ID}:${SESSION_ID}`,
          signal: "traceCompleted",
          signalArgs: [{}],
        },
      },
    ])
  })
})

describe("createRunHandler", () => {
  it("logs the completed runtime summary", async () => {
    const { publisher } = createFakeQueuePublisher()
    const { workflowStarter } = createFakeWorkflowStarter()
    const log = createMockLogger()

    await Effect.runPromise(createRunHandler({ log, publisher, workflowStarter })(payload))

    expect(log.info).toHaveBeenCalledWith("Session-end runtime completed", {
      queue: "session-end",
      task: "run",
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      latestTraceId: LATEST_TRACE_ID,
      outcome: "completed",
    })
  })
})
