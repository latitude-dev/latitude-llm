import { DatasetRowRepository } from "@domain/datasets"
import type { EmailMessage, EmailSender } from "@domain/email"
import type { MessageHandler, QueueConsumer, QueueMessage, QueueName } from "@domain/queue"
import { DatasetId, DatasetRowId, OrganizationId } from "@domain/shared"
import { DatasetRowRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { postgresSchema } from "@platform/db-postgres"
import type { StorageDisk } from "@platform/storage-object"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createDatasetExportWorker } from "./dataset-export.ts"

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
  readonly files = new Map<string, string>()
  readonly signedUrlCalls: Array<{ key: string; expiresIn?: number }> = []

  async put(key: string, contents: string | Uint8Array): Promise<void> {
    this.files.set(key, typeof contents === "string" ? contents : Buffer.from(contents).toString("utf-8"))
  }

  async putStream(key: string, contents: NodeJS.ReadableStream): Promise<void> {
    const chunks: string[] = []
    for await (const chunk of contents) {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"))
    }
    this.files.set(key, chunks.join(""))
  }

  async get(key: string): Promise<string> {
    const value = this.files.get(key)
    if (!value) throw new Error(`Missing file for key ${key}`)
    return value
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key)
  }

  async getSignedUrl(key: string, options?: { expiresIn?: number }): Promise<string> {
    if (options?.expiresIn === undefined) {
      this.signedUrlCalls.push({ key })
    } else {
      this.signedUrlCalls.push({ key, expiresIn: options.expiresIn })
    }
    return `https://download.test/${key}`
  }
}

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORG_ID = OrganizationId("org_dataset_export_test")
const PROJECT_ID = "proj_dataset_export_test"
const DATASET_ID = DatasetId("dataset_export_test")
const RECIPIENT_EMAIL = "recipient@example.com"

describe("createDatasetExportWorker", () => {
  let rowRepo: (typeof DatasetRowRepository)["Service"]

  beforeAll(async () => {
    rowRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* DatasetRowRepository
      }).pipe(withClickHouse(DatasetRowRepositoryLive, ch.client, ORG_ID)),
    )
  })

  beforeEach(async () => {
    await pg.db.delete(postgresSchema.datasets)
  })

  it("exports dataset rows to CSV, signs URL, and emails recipient", async () => {
    await pg.db.insert(postgresSchema.datasets).values({
      id: DATASET_ID,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Integration Export Dataset",
      currentVersion: 1,
    })

    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: DatasetRowId(`row-${index + 1}`),
      input: `input-${index + 1}`,
      output: `output-${index + 1}`,
      metadata: `metadata-${index + 1}`,
    }))

    await Effect.runPromise(
      rowRepo.insertBatch({
        datasetId: DATASET_ID,
        version: 1,
        rows,
      }),
    )

    const consumer = new TestQueueConsumer()
    const disk = new FakeStorageDisk()
    const sentEmails: EmailMessage[] = []
    const emailSender: EmailSender = {
      send: (message) =>
        Effect.sync(() => {
          sentEmails.push(message)
        }),
    }

    createDatasetExportWorker(consumer, {
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      disk: disk as unknown as StorageDisk,
      emailSender,
      logger: { info: () => undefined, error: () => undefined },
    })

    await consumer.dispatch("dataset-export", {
      body: Buffer.from(
        JSON.stringify({
          datasetId: DATASET_ID,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          recipientEmail: RECIPIENT_EMAIL,
        }),
        "utf-8",
      ),
      headers: new Map(),
      key: null,
    })

    expect(disk.files.size).toBe(1)
    const exportedFile = Array.from(disk.files.entries())[0]
    if (!exportedFile) throw new Error("Expected one exported CSV file")
    const [fileKey, csv] = exportedFile

    expect(fileKey).toContain("dataset-exports")
    expect(fileKey).toContain(DATASET_ID)
    expect(csv).toContain("input,output,metadata")
    expect(csv).toContain("input-1")
    expect(csv).toContain("input-1001")

    expect(disk.signedUrlCalls).toHaveLength(1)
    expect(disk.signedUrlCalls[0]?.expiresIn).toBe(7 * 24 * 60 * 60)

    expect(sentEmails).toHaveLength(1)
    expect(sentEmails[0]?.to).toBe(RECIPIENT_EMAIL)
    expect(sentEmails[0]?.subject.length).toBeGreaterThan(0)
    expect(sentEmails[0]?.html).toContain("https://download.test/")
  })

  it("ignores invalid payloads without exporting or emailing", async () => {
    const consumer = new TestQueueConsumer()
    const disk = new FakeStorageDisk()
    const sentEmails: EmailMessage[] = []
    const emailSender: EmailSender = {
      send: (message) =>
        Effect.sync(() => {
          sentEmails.push(message)
        }),
    }

    createDatasetExportWorker(consumer, {
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      disk: disk as unknown as StorageDisk,
      emailSender,
      logger: { info: () => undefined, error: () => undefined },
    })

    await consumer.dispatch("dataset-export", {
      body: Buffer.from("not-json", "utf-8"),
      headers: new Map(),
      key: null,
    })

    expect(disk.files.size).toBe(0)
    expect(sentEmails).toHaveLength(0)
  })
})
