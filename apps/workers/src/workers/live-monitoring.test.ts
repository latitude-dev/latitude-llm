import {
  buildLiveEvaluationExecuteTraceDedupeKey,
  defaultEvaluationTrigger,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "@domain/evaluations"
import type { EventEnvelope } from "@domain/events"
import type { PublishOptions, QueueName, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"
import type { RedisClient } from "@platform/cache-redis"
import { evaluations } from "@platform/db-postgres/schema/evaluations"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"

import { TestQueueConsumer } from "../testing/index.ts"
import { createDomainEventsWorker } from "./domain-events.ts"
import { createTraceEndWorker } from "./trace-end.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)
const TRACE_ID = "t".repeat(32)
const API_KEY_ID = "k".repeat(24)
const TIMESTAMP = new Date("2026-04-16T12:00:00.000Z")

const toClickHouseTimestamp = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "000")

const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])

const toSystemJson = (content: string) => JSON.stringify([{ type: "text", content }])

const makeEnvelope = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}): EventEnvelope => ({
  id: "evt-trace-end",
  event: {
    name: "SpanIngested",
    organizationId: payload.organizationId,
    payload,
  },
  occurredAt: TIMESTAMP,
})

const envelopeToDispatchPayload = (envelope: EventEnvelope) => ({
  id: envelope.id,
  event: envelope.event,
  occurredAt: envelope.occurredAt.toISOString(),
})

const makeTraceRow = () => ({
  organization_id: ORGANIZATION_ID,
  project_id: PROJECT_ID,
  session_id: "session-1",
  user_id: "",
  trace_id: TRACE_ID,
  span_id: "s".repeat(16),
  parent_span_id: "",
  api_key_id: API_KEY_ID,
  simulation_id: "",
  start_time: toClickHouseTimestamp(TIMESTAMP),
  end_time: toClickHouseTimestamp(new Date(TIMESTAMP.getTime() + 4_000)),
  name: "chat gpt-5.4",
  service_name: "live-monitoring-test",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: ["lifecycle"],
  metadata: {
    environment: "test",
    story: "live-monitoring-trace-end",
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
  input_messages: toMessageJson("user", "Please summarize the deployment checklist."),
  output_messages: toMessageJson("assistant", "Run migrations, deploy, and verify."),
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
  resource_string: { "service.name": "live-monitoring-test" },
  scope_name: "openai-instrumentation",
  scope_version: "1.0.0",
})

const makeEvaluationRow = () =>
  evaluationSchema.parse({
    id: "e".repeat(24),
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    issueId: "i".repeat(24),
    name: "pipeline-evaluation",
    description: "Live monitoring integration evaluation",
    script: "export default async function evaluate() { return { value: 1 } }",
    trigger: {
      ...defaultEvaluationTrigger(),
      filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
      sampling: 100,
      turn: "every",
      debounce: 0,
    },
    alignment: emptyEvaluationAlignment("live-monitoring-hash"),
    alignedAt: TIMESTAMP,
    archivedAt: null,
    deletedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  })

type PublishedMessage = {
  readonly queue: QueueName
  readonly task: string
  readonly payload: unknown
  readonly options?: PublishOptions
}

const createFakeWorkflowStarter = (): WorkflowStarterShape => ({
  start: () => Effect.void,
  signalWithStart: () => Effect.void,
})

const createFakeRedisClient = (): RedisClient => {
  const values = new Map<string, string>()
  const sets = new Map<string, Set<string>>()

  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      values.set(key, value)
      return "OK"
    },
    del: async (key: string) => {
      values.delete(key)
      sets.delete(key)
      return 1
    },
    sismember: async (key: string, member: string) => (sets.get(key)?.has(member) ? 1 : 0),
    scard: async (key: string) => sets.get(key)?.size ?? 0,
    smembers: async (key: string) => [...(sets.get(key) ?? new Set<string>())],
    multi: () => {
      const operations: Array<() => void> = []
      const multi = {
        sadd: (key: string, member: string) => {
          operations.push(() => {
            const existing = sets.get(key) ?? new Set<string>()
            existing.add(member)
            sets.set(key, existing)
          })
          return multi
        },
        expire: () => multi,
        exec: async () => {
          for (const operation of operations) {
            operation()
          }
          return []
        },
      }

      return multi
    },
  } as unknown as RedisClient
}

const delayedMessageKey = (queue: QueueName, dedupeKey: string) => `${queue}::${dedupeKey}`

const createQueueHarness = () => {
  const consumer = new TestQueueConsumer()
  const published: PublishedMessage[] = []
  /** Mimics BullMQ debounce+dedupe: same (queue, dedupeKey) replaces the pending delayed job. */
  const delayed = new Map<string, PublishedMessage>()

  const publisher: QueuePublisherShape = {
    publish: (queue, task, payload, options) =>
      Effect.sync(() => {
        const message = options === undefined ? { queue, task, payload } : { queue, task, payload, options }
        published.push(message)

        if (options?.debounceMs !== undefined && options.dedupeKey !== undefined) {
          delayed.set(delayedMessageKey(queue, options.dedupeKey), message)
        }
      }),
    close: () => Effect.void,
  }

  const flushDelayed = async (queue: QueueName) => {
    const prefix = `${queue}::`
    const keysToFlush = [...delayed.keys()].filter((key) => key.startsWith(prefix))

    for (const key of keysToFlush) {
      const message = delayed.get(key)
      delayed.delete(key)
      if (message) {
        await consumer.dispatchTask(queue, message.task, message.payload)
      }
    }
  }

  return {
    consumer,
    publisher,
    published,
    getDelayed: (queue: QueueName) => {
      const prefix = `${queue}::`
      return [...delayed.entries()].filter(([key]) => key.startsWith(prefix)).map(([, message]) => message)
    },
    flushDelayed,
  }
}

describe("live monitoring integration", () => {
  beforeEach(async () => {
    await pg.db.delete(evaluations)
  })

  it("debounces SpanIngested into trace-end:run before publishing execute work", async () => {
    await ch.client.insert({
      table: "spans",
      values: [makeTraceRow()],
      format: "JSONEachRow",
    })
    await pg.db.insert(evaluations).values([makeEvaluationRow()])

    const harness = createQueueHarness()

    createDomainEventsWorker({
      consumer: harness.consumer,
      publisher: harness.publisher,
    })
    createTraceEndWorker({
      consumer: harness.consumer,
      publisher: harness.publisher,
      workflowStarter: createFakeWorkflowStarter(),
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      redisClient: createFakeRedisClient(),
    })

    const envelope = makeEnvelope({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
    })

    await harness.consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(harness.getDelayed("trace-end")).toEqual([
      {
        queue: "trace-end",
        task: "run",
        payload: {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
        },
        options: {
          dedupeKey: `trace-end:run:${ORGANIZATION_ID}:${PROJECT_ID}:${TRACE_ID}`,
          debounceMs: TRACE_END_DEBOUNCE_MS,
        },
      },
    ])

    await harness.flushDelayed("trace-end")

    expect(harness.published).toContainEqual({
      queue: "projects",
      task: "checkFirstTrace",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      },
      options: {
        dedupeKey: `projects:first-trace:${PROJECT_ID}`,
      },
    })
    expect(harness.published).toContainEqual({
      queue: "live-evaluations",
      task: "execute",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        evaluationId: "e".repeat(24),
        traceId: TRACE_ID,
      },
      options: {
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          evaluationId: "e".repeat(24),
          traceId: TRACE_ID,
        }),
      },
    })
  })

  it("replaces debounced trace-end:run when SpanIngested is dispatched twice for the same trace", async () => {
    await ch.client.insert({
      table: "spans",
      values: [makeTraceRow()],
      format: "JSONEachRow",
    })
    await pg.db.insert(evaluations).values([makeEvaluationRow()])

    const harness = createQueueHarness()

    createDomainEventsWorker({
      consumer: harness.consumer,
      publisher: harness.publisher,
    })
    createTraceEndWorker({
      consumer: harness.consumer,
      publisher: harness.publisher,
      workflowStarter: createFakeWorkflowStarter(),
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      redisClient: createFakeRedisClient(),
    })

    const envelope = makeEnvelope({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
    })
    const dispatchPayload = envelopeToDispatchPayload(envelope)

    await harness.consumer.dispatchTask("domain-events", "dispatch", dispatchPayload)
    await harness.consumer.dispatchTask("domain-events", "dispatch", dispatchPayload)

    const delayedTraceEnd = harness.getDelayed("trace-end")
    expect(delayedTraceEnd).toHaveLength(1)
    expect(delayedTraceEnd[0]).toEqual({
      queue: "trace-end",
      task: "run",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      },
      options: {
        dedupeKey: `trace-end:run:${ORGANIZATION_ID}:${PROJECT_ID}:${TRACE_ID}`,
        debounceMs: TRACE_END_DEBOUNCE_MS,
      },
    })

    await harness.flushDelayed("trace-end")

    const liveEvalExecutePublishes = harness.published.filter(
      (message) => message.queue === "live-evaluations" && message.task === "execute",
    )
    expect(liveEvalExecutePublishes).toHaveLength(1)
  })
})
