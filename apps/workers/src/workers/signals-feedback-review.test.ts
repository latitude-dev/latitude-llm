import type { WorkflowStarterShape } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import type { RedisClient } from "@platform/cache-redis"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { projects } from "@platform/db-postgres/schema/projects"
import { scores } from "@platform/db-postgres/schema/scores"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { encrypt, hash } from "@repo/utils"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createSignalsWorker } from "./signals.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const CUSTOMER_ORG_ID = "c".repeat(24)
const CUSTOMER_PROJECT_ID = "d".repeat(24)
const DOGFOOD_ORG_ID = "l".repeat(24)
const DOGFOOD_PROJECT_ID = "m".repeat(24)
const SIGNAL_ID = "s".repeat(24)
const FLAGGER_TRACE_ID = "f".repeat(32)
const FOREIGN_TRACE_ID = "0".repeat(32)
const TELEMETRY_TOKEN = "lat_dogfood_review_test_token"
const TIMESTAMP = new Date("2026-08-17T12:00:00.000Z")

const toClickHouseTimestamp = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "000")

const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])

const makeSpanRow = (input: {
  readonly organizationId?: string
  readonly projectId: string
  readonly traceId: string
}) => ({
  organization_id: input.organizationId ?? DOGFOOD_ORG_ID,
  project_id: input.projectId,
  session_id: "flagger-session",
  user_id: "",
  trace_id: input.traceId,
  span_id: "a".repeat(16),
  parent_span_id: "",
  api_key_id: "k".repeat(24),
  simulation_id: "",
  start_time: toClickHouseTimestamp(TIMESTAMP),
  end_time: toClickHouseTimestamp(new Date(TIMESTAMP.getTime() + 2_000)),
  name: "flagger.classify",
  service_name: "latitude-flaggers",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: ["flagger:classify"],
  metadata: { flaggerSlug: "refusal" },
  operation: "chat",
  provider: "amazon-bedrock",
  model: "anthropic.claude-sonnet-4-6",
  response_model: "anthropic.claude-sonnet-4-6",
  tokens_input: 100,
  tokens_output: 20,
  tokens_cache_read: 0,
  tokens_cache_create: 0,
  tokens_reasoning: 0,
  cost_input_microcents: 100,
  cost_output_microcents: 200,
  cost_total_microcents: 300,
  cost_is_estimated: 1,
  time_to_first_token_ns: 100_000_000,
  is_streaming: 0,
  response_id: "flagger-response",
  finish_reasons: ["stop"],
  input_messages: toMessageJson("user", "Classify this trace."),
  output_messages: toMessageJson("assistant", '{"matched":true}'),
  system_instructions: JSON.stringify([{ type: "text", content: "You are a triage flagger." }]),
  tool_definitions: "",
  tool_call_id: "",
  tool_name: "",
  tool_input: "",
  tool_output: "",
  attr_string: {},
  attr_int: {},
  attr_float: {},
  attr_bool: {},
  resource_string: { "service.name": "latitude-flaggers" },
  scope_name: "latitude-capture",
  scope_version: "1.0.0",
})

const createFakeRedisClient = (): RedisClient => {
  const values = new Map<string, string>()
  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      values.set(key, value)
      return "OK"
    },
    del: async (key: string) => {
      values.delete(key)
      return 1
    },
  } as unknown as RedisClient
}

const workflowStarter = {
  start: () => Effect.die("Unexpected workflow start"),
} as unknown as WorkflowStarterShape

const setupWorker = () => {
  const consumer = new TestQueueConsumer()
  const { publisher, published } = createFakeQueuePublisher()

  return createSignalsWorker({
    consumer,
    publisher,
    workflowStarter,
    postgresClient: pg.adminPostgresClient,
    adminPostgresClient: pg.adminPostgresClient,
    clickhouseClient: ch.client,
    redisClient: createFakeRedisClient(),
  }).then(() => ({ consumer, published }))
}

const dispatchReview = async (overrides: { readonly flaggerTraceId?: string } = {}) => {
  const { consumer } = await setupWorker()
  await consumer.dispatchTask("issues", "reviewFlaggerOccurrence", {
    organizationId: CUSTOMER_ORG_ID,
    projectId: CUSTOMER_PROJECT_ID,
    signalId: SIGNAL_ID,
    flaggerTraceId: overrides.flaggerTraceId ?? FLAGGER_TRACE_ID,
    flaggerSlug: "refusal",
    value: 0,
    passed: false,
    feedback: "This was never a problem",
  })
}

describe("signals worker reviewFlaggerOccurrence", () => {
  beforeAll(async () => {
    const encryptionKey = Buffer.from(process.env.LAT_MASTER_ENCRYPTION_KEY ?? "", "hex")
    const tokenHash = await Effect.runPromise(hash(TELEMETRY_TOKEN))
    const encryptedToken = await Effect.runPromise(encrypt(TELEMETRY_TOKEN, encryptionKey))

    await pg.db.insert(apiKeys).values({
      id: "t".repeat(24),
      token: encryptedToken,
      tokenHash,
      name: "telemetry",
      organizationId: DOGFOOD_ORG_ID,
    })
    await pg.db.insert(projects).values([
      { id: DOGFOOD_PROJECT_ID, name: "Latitude flaggers", slug: "latitude-flaggers", organizationId: DOGFOOD_ORG_ID },
      // A customer project holding the same slug, to prove the credential — not the
      // slug — decides which organization is written to.
      { id: CUSTOMER_PROJECT_ID, name: "Flaggers", slug: "latitude-flaggers", organizationId: CUSTOMER_ORG_ID },
    ])

    process.env.LAT_LATITUDE_TELEMETRY_API_KEY = TELEMETRY_TOKEN
  })

  beforeEach(async () => {
    await pg.db.delete(scores)
    await ch.client.insert({
      table: "spans",
      values: [makeSpanRow({ projectId: DOGFOOD_PROJECT_ID, traceId: FLAGGER_TRACE_ID })],
      format: "JSONEachRow",
    })
  })

  it("annotates the flagger trace in the dogfood organization and nowhere else", async () => {
    await dispatchReview()

    const rows = await pg.db.select().from(scores)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      organizationId: DOGFOOD_ORG_ID,
      projectId: DOGFOOD_PROJECT_ID,
      traceId: FLAGGER_TRACE_ID,
      sourceType: "annotation",
      sourceId: "API",
      annotatorId: null,
      passed: false,
      value: 0,
      feedback: "This was never a problem",
      draftedAt: null,
    })
    expect(rows.filter((row) => row.organizationId === CUSTOMER_ORG_ID)).toEqual([])
  })

  it("writes nothing on a redelivery of the same review", async () => {
    await dispatchReview()
    await dispatchReview()

    expect(await pg.db.select().from(scores)).toHaveLength(1)
  })

  it("skips a trace that lives in the customer's project rather than the dogfood one", async () => {
    await ch.client.insert({
      table: "spans",
      values: [
        makeSpanRow({
          organizationId: CUSTOMER_ORG_ID,
          projectId: CUSTOMER_PROJECT_ID,
          traceId: FOREIGN_TRACE_ID,
        }),
      ],
      format: "JSONEachRow",
    })

    await dispatchReview({ flaggerTraceId: FOREIGN_TRACE_ID })

    expect(await pg.db.select().from(scores)).toEqual([])
  })
})
