import type { DomainEvent, EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueueName, QueuePublishError, TaskHandlers } from "@domain/queue"
import { queryClickhouse } from "@platform/db-clickhouse"
import { FakeStorageDisk } from "@platform/storage-object/testing"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createSpanIngestionWorker } from "./span-ingestion.ts"

type AnyTaskHandlers = Record<string, (payload: unknown) => Effect.Effect<void, unknown>>

class TestQueueConsumer implements QueueConsumer {
  private readonly registered = new Map<QueueName, AnyTaskHandlers>()

  subscribe<T extends QueueName>(queue: T, handlers: TaskHandlers<T>): void {
    this.registered.set(queue, handlers as unknown as AnyTaskHandlers)
  }

  start() {
    return Effect.void
  }

  stop() {
    return Effect.void
  }

  async dispatchTask(queue: QueueName, task: string, payload: unknown): Promise<void> {
    const handlers = this.registered.get(queue)
    if (!handlers) throw new Error(`No handlers registered for queue ${queue}`)
    const handler = handlers[task]
    if (!handler) throw new Error(`No handler for task ${task} on queue ${queue}`)
    await Effect.runPromise(handler(payload))
  }
}

const ch = setupTestClickHouse()

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

  it("drops invalid payloads without inserting spans", async () => {
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
  })
})
