import { createFakeQueuePublisher } from "@domain/queue/testing"
import { SESSION_END_DEBOUNCE_MS } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { createRunHandler, createTraceEndWorker, runTraceEndJob } from "./trace-end.ts"

const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)
const TRACE_ID = "t".repeat(32)
const SESSION_ID = "session-1"
const API_KEY_ID = "k".repeat(24)
const TIMESTAMP = new Date("2026-04-15T12:00:00.000Z")

const toClickHouseTimestamp = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "000")

const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])

const toSystemJson = (content: string) => JSON.stringify([{ type: "text", content }])

const makeTraceRow = (input?: {
  readonly traceId?: string
  readonly sessionId?: string
  readonly tags?: string[]
  readonly projectId?: string
}) => ({
  organization_id: ORGANIZATION_ID,
  project_id: input?.projectId ?? PROJECT_ID,
  session_id: input?.sessionId ?? SESSION_ID,
  user_id: "",
  trace_id: input?.traceId ?? TRACE_ID,
  span_id: "s".repeat(16),
  parent_span_id: "",
  api_key_id: API_KEY_ID,
  simulation_id: "",
  start_time: toClickHouseTimestamp(TIMESTAMP),
  end_time: toClickHouseTimestamp(new Date(TIMESTAMP.getTime() + 4_000)),
  name: "chat gpt-5.4",
  service_name: "trace-end-test",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: input?.tags ?? ["lifecycle"],
  metadata: {
    environment: "test",
    story: "trace-end-worker",
  },
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
  system_instructions: toSystemJson("You are a helpful assistant."),
  tool_definitions: "",
  tool_call_id: "",
  tool_name: "",
  tool_input: "",
  tool_output: "",
  attr_string: {},
  attr_int: {},
  attr_float: {},
  attr_bool: {},
  resource_string: { "service.name": "trace-end-test" },
  scope_name: "openai-instrumentation",
  scope_version: "1.0.0",
})

const insertTraceRows = async (rows: Array<Record<string, unknown>>) => {
  await ch.client.insert({
    table: "spans",
    values: rows,
    format: "JSONEachRow",
  })
}

describe("createTraceEndWorker", () => {
  it("registers the trace-end run task", () => {
    const consumer = new TestQueueConsumer()
    const { publisher } = createFakeQueuePublisher()

    createTraceEndWorker({
      consumer,
      publisher,
      clickhouseClient: ch.client,
    })

    expect(consumer.getRegisteredTasks("trace-end")).toEqual(["run"])
  })
})

describe("runTraceEndJob", () => {
  it("skips when the trace no longer exists", async () => {
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      runTraceEndJob({
        publisher,
        clickhouseClient: ch.client,
      })({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      }),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "trace-not-found",
      traceId: TRACE_ID,
    })
    expect(published).toEqual([])
  })

  it("skips all LLM work for sandbox traces (before loading the trace)", async () => {
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      runTraceEndJob({
        publisher,
        clickhouseClient: ch.client,
      })({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        isSandbox: true,
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "sandbox", traceId: TRACE_ID })
    expect(published).toEqual([])
  })

  it("enqueues trace-search and session-end (flaggers moved to the session path)", async () => {
    await insertTraceRows([makeTraceRow()])

    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      runTraceEndJob({
        publisher,
        clickhouseClient: ch.client,
      })({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      }),
    )

    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: TRACE_ID,
        sessionId: SESSION_ID,
      },
    })

    // Verify trace-search refresh task was published
    const traceSearchPublish = published.find((p) => p.queue === "trace-search")
    expect(traceSearchPublish?.task).toBe("refreshTrace")
    expect(traceSearchPublish?.payload).toMatchObject({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
    })

    // Session-level work (signals:match, session analysis) is handed to session-end, debounced per
    // session and carrying the session's latest trace. trace-end no longer publishes signals:match.
    expect(published.find((p) => p.queue === "signals")).toBeUndefined()
    const sessionEndPublish = published.find((p) => p.queue === "session-end")
    expect(sessionEndPublish?.task).toBe("run")
    expect(sessionEndPublish?.payload).toMatchObject({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      latestTraceId: TRACE_ID,
      latestTraceStartTime: TIMESTAMP.toISOString(),
      isSandbox: false,
    })
    expect(sessionEndPublish?.options).toMatchObject({
      dedupeKey: `org:${ORGANIZATION_ID}:session-end:${PROJECT_ID}:${SESSION_ID}`,
      debounceMs: SESSION_END_DEBOUNCE_MS,
    })
  })
})

describe("createRunHandler", () => {
  it("logs the completed runtime summary", async () => {
    const projectId = "x".repeat(24)
    const traceId = "v".repeat(32)
    const sessionId = "session-2"

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        sessionId,
      }),
    ])

    const { publisher } = createFakeQueuePublisher()
    const log = createMockLogger()

    await Effect.runPromise(
      createRunHandler({
        log,
        publisher,
        clickhouseClient: ch.client,
      })({
        organizationId: ORGANIZATION_ID,
        projectId,
        traceId,
      }),
    )

    expect(log.info).toHaveBeenCalledWith("Trace-end runtime completed", {
      queue: "trace-end",
      task: "run",
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
      outcome: "completed",
      sessionId,
    })
  })
})
