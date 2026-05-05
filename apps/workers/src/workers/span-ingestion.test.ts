import type { DomainEvent, EventsPublisher } from "@domain/events"
import type { QueuePublishError } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { generateId } from "@domain/shared"
import { queryClickhouse } from "@platform/db-clickhouse"
import { eq } from "@platform/db-postgres"
import { billingUsageEvents, billingUsagePeriods } from "@platform/db-postgres/schema/billing"
import { FakeStorageDisk } from "@platform/storage-object/testing"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createBillingWorker } from "./billing.ts"
import { createSpanIngestionWorker } from "./span-ingestion.ts"

const ch = setupTestClickHouse()
const pg = setupTestPostgres()

function createFakeEventsPublisher(): EventsPublisher<QueuePublishError> & {
  readonly published: DomainEvent[]
} {
  const published: DomainEvent[] = []
  return {
    published,
    publish: (event) => {
      published.push(event)
      return Effect.void
    },
  }
}

const validRequest = {
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
      },
      scopeSpans: [
        {
          scope: { name: "test-scope", version: "1.0.0" },
          spans: [
            {
              traceId: "0af7651916cd43dd8448eb211c80319c",
              spanId: "b7ad6b7169203331",
              name: "test-span",
              kind: 1,
              startTimeUnixNano: "1710590400000000000",
              endTimeUnixNano: "1710590401000000000",
              attributes: [{ key: "custom.attr", value: { stringValue: "hello" } }],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}

const dispatchValidIngest = async (
  consumer: TestQueueConsumer,
  fileKey: string,
  organizationId: string,
  projectId: string,
) => {
  await consumer.dispatchTask("span-ingestion", "ingest", {
    fileKey,
    inlinePayload: null,
    contentType: "application/json",
    organizationId,
    projectId,
    apiKeyId: `api-key-${organizationId}`,
    ingestedAt: "2026-03-18T10:00:00.000Z",
  })
}

const vercelWrapperRequest = {
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
      },
      scopeSpans: [
        {
          scope: { name: "ai", version: "6.0.116" },
          spans: [
            {
              traceId: "11111111111111111111111111111111",
              spanId: "aaaaaaaaaaaaaaaa",
              name: "ai.generateText",
              kind: 1,
              startTimeUnixNano: "1710590400000000000",
              endTimeUnixNano: "1710590401000000000",
              attributes: [
                { key: "ai.operationId", value: { stringValue: "ai.generateText" } },
                { key: "ai.model.id", value: { stringValue: "gpt-4o" } },
                { key: "ai.model.provider", value: { stringValue: "openai.responses" } },
                { key: "ai.usage.promptTokens", value: { intValue: "918" } },
                { key: "ai.usage.completionTokens", value: { intValue: "31" } },
              ],
              status: { code: 1 },
            },
            {
              traceId: "11111111111111111111111111111111",
              spanId: "bbbbbbbbbbbbbbbb",
              parentSpanId: "aaaaaaaaaaaaaaaa",
              name: "ai.generateText.doGenerate",
              kind: 1,
              startTimeUnixNano: "1710590400001000000",
              endTimeUnixNano: "1710590400999000000",
              attributes: [
                { key: "ai.operationId", value: { stringValue: "ai.generateText.doGenerate" } },
                { key: "gen_ai.system", value: { stringValue: "openai.responses" } },
                { key: "ai.model.id", value: { stringValue: "gpt-4o" } },
                { key: "ai.model.provider", value: { stringValue: "openai.responses" } },
                { key: "ai.usage.promptTokens", value: { intValue: "918" } },
                { key: "ai.usage.completionTokens", value: { intValue: "31" } },
              ],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}

describe("createSpanIngestionWorker", () => {
  it("ingests JSON OTLP messages and inserts spans into ClickHouse", async () => {
    const consumer = new TestQueueConsumer()
    const disk = new FakeStorageDisk()
    const pub = createFakeEventsPublisher()
    const fileKey = "span-ingestion/test-valid.json"
    disk.putBytes(fileKey, Buffer.from(JSON.stringify(validRequest), "utf-8"))

    createSpanIngestionWorker({ consumer, eventsPublisher: pub, clickhouseClient: ch.client, disk })

    await consumer.dispatchTask("span-ingestion", "ingest", {
      fileKey,
      inlinePayload: null,
      contentType: "application/json",
      organizationId: "org_span_ingestion_test",
      projectId: "proj_span_ingestion_test",
      apiKeyId: "api_key_span_ingestion_test",
      ingestedAt: "2026-03-18T10:00:00.000Z",
    })

    const rows = await Effect.runPromise(
      queryClickhouse<{
        organization_id: string
        project_id: string
        api_key_id: string
        name: string
        trace_id: string
        ingested_at: string
      }>(
        ch.client,
        `SELECT organization_id, project_id, api_key_id, name, trace_id, ingested_at
         FROM spans
         WHERE organization_id = {organizationId:String}`,
        { organizationId: "org_span_ingestion_test" },
      ),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.project_id).toBe("proj_span_ingestion_test")
    expect(rows[0]?.api_key_id).toBe("api_key_span_ingestion_test")
    expect(rows[0]?.name).toBe("test-span")
    expect(rows[0]?.trace_id).toBe("0af7651916cd43dd8448eb211c80319c")
    expect(rows[0]?.ingested_at).toContain("2026-03-18 10:00:00")

    expect(pub.published).toHaveLength(1)
    expect(pub.published[0]?.name).toBe("SpanIngested")
    expect(pub.published[0]?.payload).toEqual({
      organizationId: "org_span_ingestion_test",
      projectId: "proj_span_ingestion_test",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    })
  })

  it("returns early when neither inlinePayload nor fileKey is provided", async () => {
    const consumer = new TestQueueConsumer()
    const disk = new FakeStorageDisk()
    const pub = createFakeEventsPublisher()

    createSpanIngestionWorker({ consumer, eventsPublisher: pub, clickhouseClient: ch.client, disk })

    await consumer.dispatchTask("span-ingestion", "ingest", {
      fileKey: null,
      inlinePayload: null,
      contentType: "application/json",
      organizationId: "org_no_payload_test",
      projectId: "proj_no_payload_test",
      apiKeyId: "api_key_no_payload_test",
      ingestedAt: "2026-03-18T10:00:00.000Z",
    })

    const [count] = await Effect.runPromise(
      queryClickhouse<{ total: string }>(
        ch.client,
        "SELECT count() AS total FROM spans WHERE organization_id = {organizationId:String}",
        { organizationId: "org_no_payload_test" },
      ),
    )

    expect(Number(count?.total ?? 0)).toBe(0)
    expect(pub.published).toHaveLength(0)
  })

  it("drops invalid payloads without inserting spans", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const consumer = new TestQueueConsumer()
      const disk = new FakeStorageDisk()
      const pub = createFakeEventsPublisher()
      const fileKey = "span-ingestion/test-invalid.json"
      disk.putBytes(fileKey, Buffer.from("not-json", "utf-8"))

      createSpanIngestionWorker({ consumer, eventsPublisher: pub, clickhouseClient: ch.client, disk })

      await consumer.dispatchTask("span-ingestion", "ingest", {
        fileKey,
        inlinePayload: null,
        contentType: "application/json",
        organizationId: "org_span_ingestion_test",
        projectId: "proj_span_ingestion_test",
        apiKeyId: "api_key_span_ingestion_test",
        ingestedAt: "2026-03-18T10:00:00.000Z",
      })

      const [count] = await Effect.runPromise(
        queryClickhouse<{ total: string }>(
          ch.client,
          "SELECT count() AS total FROM spans WHERE organization_id = {organizationId:String}",
          { organizationId: "org_span_ingestion_test" },
        ),
      )

      expect(Number(count?.total ?? 0)).toBe(0)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("keeps Vercel outer wrappers for tree structure while moving estimated cost onto the inner token span", async () => {
    const consumer = new TestQueueConsumer()
    const disk = new FakeStorageDisk()
    const pub = createFakeEventsPublisher()
    const fileKey = "span-ingestion/test-vercel-wrapper.json"
    disk.putBytes(fileKey, Buffer.from(JSON.stringify(vercelWrapperRequest), "utf-8"))

    createSpanIngestionWorker({ consumer, eventsPublisher: pub, clickhouseClient: ch.client, disk })

    await consumer.dispatchTask("span-ingestion", "ingest", {
      fileKey,
      inlinePayload: null,
      contentType: "application/json",
      organizationId: "org_vercel_wrapper_test",
      projectId: "proj_vercel_wrapper_test",
      apiKeyId: "api_key_vercel_wrapper_test",
      ingestedAt: "2026-03-18T10:00:00.000Z",
    })

    const rows = await Effect.runPromise(
      queryClickhouse<{
        name: string
        trace_id: string
        tokens_input: string
        tokens_output: string
        cost_total_microcents: string
        parent_span_id: string
        ai_operation_id: string
        provider: string
        model: string
      }>(
        ch.client,
        `SELECT
           name,
           trace_id,
           tokens_input,
           tokens_output,
           cost_total_microcents,
           parent_span_id,
           attr_string['ai.operationId'] AS ai_operation_id,
           provider,
           model
         FROM spans
         WHERE organization_id = {organizationId:String}
         ORDER BY start_time ASC`,
        { organizationId: "org_vercel_wrapper_test" },
      ),
    )

    expect(rows).toHaveLength(2)

    expect(rows[0]?.name).toBe("ai.generateText")
    expect(rows[0]?.trace_id).toBe("11111111111111111111111111111111")
    expect(Number(rows[0]?.tokens_input ?? 0)).toBe(0)
    expect(Number(rows[0]?.tokens_output ?? 0)).toBe(0)
    expect(Number(rows[0]?.cost_total_microcents ?? 0)).toBe(0)
    expect(rows[0]?.parent_span_id).toBe("")
    expect(rows[0]?.ai_operation_id).toBe("ai.generateText")
    expect(rows[0]?.provider).toBe("openai")
    expect(rows[0]?.model).toBe("gpt-4o")

    expect(rows[1]?.name).toBe("ai.generateText.doGenerate")
    expect(rows[1]?.trace_id).toBe("11111111111111111111111111111111")
    expect(Number(rows[1]?.tokens_input ?? 0)).toBe(918)
    expect(Number(rows[1]?.tokens_output ?? 0)).toBe(31)
    expect(Number(rows[1]?.cost_total_microcents ?? 0)).toBeGreaterThan(0)
    expect(rows[1]?.parent_span_id).toBe("aaaaaaaaaaaaaaaa")
    expect(rows[1]?.ai_operation_id).toBe("ai.generateText.doGenerate")
    expect(rows[1]?.provider).toBe("openai.responses")
    expect(rows[1]?.model).toBe("gpt-4o")

    expect(pub.published).toHaveLength(1)
    expect(pub.published[0]?.payload).toEqual({
      organizationId: "org_vercel_wrapper_test",
      projectId: "proj_vercel_wrapper_test",
      traceId: "11111111111111111111111111111111",
    })
  })

  it("records trace usage only once across repeated ingest requests for the same trace", async () => {
    const consumer = new TestQueueConsumer()
    const disk = new FakeStorageDisk()
    const pub = createFakeEventsPublisher()
    const queue = createFakeQueuePublisher()
    const fileKey = `span-ingestion/${generateId()}-duplicate.json`
    const organizationId = generateId()
    const projectId = generateId()
    disk.putBytes(fileKey, Buffer.from(JSON.stringify(validRequest), "utf-8"))

    createSpanIngestionWorker({
      consumer,
      eventsPublisher: pub,
      clickhouseClient: ch.client,
      disk,
      postgresClient: pg.appPostgresClient,
      publisher: queue.publisher,
    })
    createBillingWorker({
      consumer,
      postgresClient: pg.appPostgresClient,
      publisher: queue.publisher,
    })

    await dispatchValidIngest(consumer, fileKey, organizationId, projectId)
    for (const message of queue.published.filter(
      (message) => message.queue === "billing" && message.task === "recordTraceUsageBatch",
    )) {
      await consumer.dispatchTask("billing", "recordTraceUsageBatch", message.payload)
    }

    await dispatchValidIngest(consumer, fileKey, organizationId, projectId)
    for (const message of queue.published.filter(
      (message) => message.queue === "billing" && message.task === "recordTraceUsageBatch",
    ).slice(1)) {
      await consumer.dispatchTask("billing", "recordTraceUsageBatch", message.payload)
    }

    const events = await pg.db
      .select()
      .from(billingUsageEvents)
      .where(eq(billingUsageEvents.organizationId, organizationId))
    const periods = await pg.db
      .select()
      .from(billingUsagePeriods)
      .where(eq(billingUsagePeriods.organizationId, organizationId))

    expect(events).toHaveLength(1)
    expect(events[0]?.action).toBe("trace")
    expect(events[0]?.credits).toBe(1)

    expect(periods).toHaveLength(1)
    expect(periods[0]?.consumedCredits).toBe(1)
    expect(periods[0]?.overageCredits).toBe(0)

    const billingPublishes = queue.published.filter(
      (message) => message.queue === "billing" && message.task === "recordTraceUsageBatch",
    )
    expect(billingPublishes).toHaveLength(2)
  })
})
