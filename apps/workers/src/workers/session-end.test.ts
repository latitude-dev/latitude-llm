import type { WorkflowStarterShape } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { createRunHandler, createSessionEndWorker, runSessionEndJob } from "./session-end.ts"

const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)
const SESSION_ID = "session-1"
const TRACE_OLD = "a".repeat(32)
const TRACE_NEW = "b".repeat(32)
const OLD_START = new Date("2026-04-15T12:00:00.000Z")
const NEW_START = new Date("2026-04-15T12:05:00.000Z")

const toClickHouseTimestamp = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "000")

const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])

const makeTraceRow = (input: { readonly traceId: string; readonly startTime: Date; readonly sessionId?: string }) => ({
  organization_id: ORGANIZATION_ID,
  project_id: PROJECT_ID,
  session_id: input.sessionId ?? SESSION_ID,
  user_id: "",
  trace_id: input.traceId,
  span_id: input.traceId.slice(0, 16),
  parent_span_id: "",
  api_key_id: "k".repeat(24),
  simulation_id: "",
  start_time: toClickHouseTimestamp(input.startTime),
  end_time: toClickHouseTimestamp(new Date(input.startTime.getTime() + 4_000)),
  name: "chat gpt-5.4",
  service_name: "session-end-test",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: [],
  metadata: {},
  operation: "chat",
  provider: "openai",
  model: "gpt-5.4",
  response_model: "gpt-5.4",
  tokens_input: 64,
  tokens_output: 48,
  tokens_cache_read: 0,
  tokens_cache_create: 0,
  tokens_reasoning: 0,
  cost_input_microcents: 1_600,
  cost_output_microcents: 4_800,
  cost_total_microcents: 6_400,
  cost_is_estimated: 1,
  time_to_first_token_ns: 180_000_000,
  is_streaming: 0,
  response_id: "seed-response",
  finish_reasons: ["stop"],
  input_messages: toMessageJson("user", "Summarize the deployment checklist."),
  output_messages: toMessageJson("assistant", "Verify migrations, deploy, and monitor."),
  system_instructions: "",
  tool_definitions: "",
  tool_call_id: "",
  tool_name: "",
  tool_input: "",
  tool_output: "",
  attr_string: {},
  attr_int: {},
  attr_float: {},
  attr_bool: {},
  resource_string: { "service.name": "session-end-test" },
  scope_name: "openai-instrumentation",
  scope_version: "1.0.0",
})

const insertTraceRows = async (rows: Array<Record<string, unknown>>) => {
  await ch.client.insert({ table: "spans", values: rows, format: "JSONEachRow" })
}

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

    createSessionEndWorker({ consumer, publisher, clickhouseClient: ch.client, workflowStarter })

    expect(consumer.getRegisteredTasks("session-end")).toEqual(["run"])
  })
})

describe("runSessionEndJob", () => {
  it("skips all work for sandbox sessions", async () => {
    const { publisher, published } = createFakeQueuePublisher()
    const { workflowStarter, started } = createFakeWorkflowStarter()

    const result = await Effect.runPromise(
      runSessionEndJob({ publisher, clickhouseClient: ch.client, workflowStarter })({
        ...basePayload,
        isSandbox: true,
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "sandbox", sessionId: SESSION_ID })
    expect(published).toEqual([])
    expect(started).toEqual([])
  })

  it("matches signals against the session's actual latest trace, not the enqueued one", async () => {
    // Payload points at the older trace (as an out-of-order debounce replacement would), but the
    // session's latest output trace is TRACE_NEW.
    await insertTraceRows([
      makeTraceRow({ traceId: TRACE_OLD, startTime: OLD_START }),
      makeTraceRow({ traceId: TRACE_NEW, startTime: NEW_START }),
    ])

    const { publisher, published } = createFakeQueuePublisher()
    const { workflowStarter, started } = createFakeWorkflowStarter()

    const result = await Effect.runPromise(
      runSessionEndJob({ publisher, clickhouseClient: ch.client, workflowStarter })(basePayload),
    )

    expect(result).toEqual({ action: "completed", sessionId: SESSION_ID, latestTraceId: TRACE_NEW })

    const signalsMatchPublish = published.find((p) => p.queue === "signals")
    expect(signalsMatchPublish?.task).toBe("match")
    expect(signalsMatchPublish?.payload).toMatchObject({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      traceId: TRACE_NEW,
      reason: "ingest",
    })
    expect(signalsMatchPublish?.options).toMatchObject({
      dedupeKey: `org:${ORGANIZATION_ID}:signals-match:${PROJECT_ID}:${TRACE_NEW}`,
    })

    // Session analysis reloads the whole session, so it keeps the enqueued trace as its pointer.
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

  it("falls back to the enqueued trace when the session is not materialized", async () => {
    const { publisher, published } = createFakeQueuePublisher()
    const { workflowStarter } = createFakeWorkflowStarter()

    const result = await Effect.runPromise(
      runSessionEndJob({ publisher, clickhouseClient: ch.client, workflowStarter })({
        ...basePayload,
        sessionId: "unmaterialized-session",
        latestTraceId: TRACE_OLD,
      }),
    )

    expect(result).toEqual({ action: "completed", sessionId: "unmaterialized-session", latestTraceId: TRACE_OLD })

    const signalsMatchPublish = published.find((p) => p.queue === "signals")
    expect(signalsMatchPublish?.payload).toMatchObject({ traceId: TRACE_OLD })
  })
})

describe("createRunHandler", () => {
  it("logs the completed runtime summary", async () => {
    await insertTraceRows([makeTraceRow({ traceId: TRACE_NEW, startTime: NEW_START })])

    const { publisher } = createFakeQueuePublisher()
    const { workflowStarter } = createFakeWorkflowStarter()
    const log = createMockLogger()

    await Effect.runPromise(
      createRunHandler({ log, publisher, clickhouseClient: ch.client, workflowStarter })(basePayload),
    )

    expect(log.info).toHaveBeenCalledWith("Session-end runtime completed", {
      queue: "session-end",
      task: "run",
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      latestTraceId: TRACE_OLD,
      outcome: "completed",
      resolvedLatestTraceId: TRACE_NEW,
    })
  })
})
