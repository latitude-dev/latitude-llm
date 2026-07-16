import type { WorkflowStarterShape } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { createRunHandler, createSessionEndWorker, runSessionEndJob } from "./session-end.ts"

const ORGANIZATION_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)
const SESSION_ID = "session-1"
const TRACE_OLD = "a".repeat(32)
const OLD_START = new Date("2026-04-15T12:00:00.000Z")

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

const basePayload = {
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  sessionId: SESSION_ID,
  latestTraceId: TRACE_OLD,
  latestTraceStartTime: OLD_START.toISOString(),
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
    const { workflowStarter, started } = createFakeWorkflowStarter()

    const result = await Effect.runPromise(
      runSessionEndJob({ workflowStarter })({
        ...basePayload,
        isSandbox: true,
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "sandbox", sessionId: SESSION_ID })
    expect(started).toEqual([])
  })

  it("starts session analysis with the enqueued trace pointer", async () => {
    const { workflowStarter, started } = createFakeWorkflowStarter()

    const result = await Effect.runPromise(runSessionEndJob({ workflowStarter })(basePayload))

    expect(result).toEqual({ action: "completed", sessionId: SESSION_ID })
    expect(started).toEqual([
      {
        workflow: "analyzeSessionWorkflow",
        mode: "signalWithStart",
        input: {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          sessionId: SESSION_ID,
          triggeringTraceId: TRACE_OLD,
          triggeringStartTime: OLD_START.toISOString(),
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
    const { workflowStarter } = createFakeWorkflowStarter()
    const log = createMockLogger()

    await Effect.runPromise(createRunHandler({ log, workflowStarter })(basePayload))

    expect(log.info).toHaveBeenCalledWith("Session-end runtime completed", {
      queue: "session-end",
      task: "run",
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      latestTraceId: TRACE_OLD,
      outcome: "completed",
    })
  })
})
