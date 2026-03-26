import { DatasetRowRepository } from "@domain/datasets"
import type { EmailMessage, EmailSender } from "@domain/email"
import type { QueueConsumer, QueueName, TaskHandlers } from "@domain/queue"
import { DatasetId, DatasetRowId, OrganizationId } from "@domain/shared"
import { DatasetRowRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { datasets } from "@platform/db-postgres/schema/datasets"
import { FakeStorageDisk } from "@platform/storage-object/testing"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { createDatasetExportWorker } from "./dataset-export.ts"

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

  it("exports dataset rows to CSV, signs URL, and emails recipient", async () => {
    await pg.db.insert(datasets).values({
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

    createDatasetExportWorker({
      consumer,
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      disk,
      emailSender,
    })

    await consumer.dispatchTask("dataset-export", "export", {
      datasetId: DATASET_ID,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      recipientEmail: RECIPIENT_EMAIL,
    })

    expect(disk.files.size).toBe(1)
    const exportedFile = Array.from(disk.files.entries())[0]
    if (!exportedFile) throw new Error("Expected one exported CSV file")
    const [fileKey, csvBytes] = exportedFile
    const csv = new TextDecoder().decode(csvBytes)

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
})
