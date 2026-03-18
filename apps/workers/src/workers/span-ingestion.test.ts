import type { MessageHandler, QueueConsumer, QueueMessage, QueueName } from "@domain/queue"
import { queryClickhouse } from "@platform/db-clickhouse"
import type { StorageDisk } from "@platform/storage-object"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createSpanIngestionWorker } from "./span-ingestion.ts"

class TestQueueConsumer implements QueueConsumer {
  private readonly handlers = new Map<QueueName, MessageHandler>()

  subscribe(queue: QueueName, handler: MessageHandler): void {
    this.handlers.set(queue, handler)
  }

  start() {
    return Effect.void
  }

  stop() {
    return Effect.void
  }

  async dispatch(queue: QueueName, message: QueueMessage): Promise<void> {
    const handler = this.handlers.get(queue)
    if (!handler) throw new Error(`No handler registered for queue ${queue}`)
    await Effect.runPromise(handler.handle(message))
  }
}

class FakeStorageDisk {
  private readonly files = new Map<string, Uint8Array>()

  putBytes(key: string, value: Uint8Array): void {
    this.files.set(key, value)
  }

  async getBytes(key: string): Promise<Uint8Array> {
    const value = this.files.get(key)
    if (!value) {
      throw new Error(`Missing storage key ${key}`)
    }
    return value
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key)
  }
}

const ch = setupTestClickHouse()

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
    const fileKey = "span-ingestion/test-valid.json"
    disk.putBytes(fileKey, Buffer.from(JSON.stringify(validRequest), "utf-8"))

    createSpanIngestionWorker(consumer, {
      clickhouseClient: ch.client,
      disk: disk as unknown as StorageDisk,
      logger: { error: () => undefined },
    })

    await consumer.dispatch("span-ingestion", {
      body: Buffer.from(fileKey, "utf-8"),
      headers: new Map([
        ["content-type", "application/json"],
        ["organization-id", "org_span_ingestion_test"],
        ["project-id", "proj_span_ingestion_test"],
        ["api-key-id", "api_key_span_ingestion_test"],
        ["ingested-at", "2026-03-18T10:00:00.000Z"],
      ]),
      key: null,
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
  })

  it("drops invalid payloads without inserting spans", async () => {
    const consumer = new TestQueueConsumer()
    const disk = new FakeStorageDisk()
    const fileKey = "span-ingestion/test-invalid.json"
    disk.putBytes(fileKey, Buffer.from("not-json", "utf-8"))

    createSpanIngestionWorker(consumer, {
      clickhouseClient: ch.client,
      disk: disk as unknown as StorageDisk,
      logger: { error: () => undefined },
    })

    await consumer.dispatch("span-ingestion", {
      body: Buffer.from(fileKey, "utf-8"),
      headers: new Map([
        ["content-type", "application/json"],
        ["organization-id", "org_span_ingestion_test"],
        ["project-id", "proj_span_ingestion_test"],
      ]),
      key: null,
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
