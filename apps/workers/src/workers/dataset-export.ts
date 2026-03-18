import { Readable } from "node:stream"
import { csvExportHeader, DatasetRepository, DatasetRowRepository, rowsToCsvFragment } from "@domain/datasets"
import { datasetExportTemplate, type RenderedEmail, sendEmail } from "@domain/email"
import type { MessageHandler, QueueConsumer, QueueMessage } from "@domain/queue"
import { DatasetId, OrganizationId, putInDiskStream } from "@domain/shared"
import { DatasetRowRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createPostgresClient, DatasetRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { createStorageDisk } from "@platform/storage-object"
import { createLogger } from "@repo/observability"
import { Data, Effect } from "effect"
import { getClickhouseClient } from "../clients.ts"
import { parseDatasetExportPayload } from "./dataset-export-payload.ts"

class DatasetExportError extends Data.TaggedError("DatasetExportError")<{
  readonly cause: unknown
}> {}

const logger = createLogger("dataset-export")

const BATCH_SIZE = 1000
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60

export const createDatasetExportWorker = (consumer: QueueConsumer) => {
  const pgClient = createPostgresClient()
  const chClient = getClickhouseClient()
  const disk = createStorageDisk()
  const emailSender = createEmailTransportSender()
  const sendEmailUseCase = sendEmail({ emailSender })

  const handler: MessageHandler = {
    handle: (message: QueueMessage) => {
      const payload = parseDatasetExportPayload(message.body)
      if (!payload) {
        logger.error("Dataset export: failed to parse payload")
        return Effect.void
      }

      const organizationId = OrganizationId(payload.organizationId)
      const datasetId = DatasetId(payload.datasetId)

      return Effect.gen(function* () {
        const datasetRepo = yield* DatasetRepository
        const dataset = yield* datasetRepo.findById(datasetId)

        const rowRepo = yield* DatasetRowRepository
        const csvChunks: string[] = [csvExportHeader()]
        let offset = 0
        while (true) {
          const rows = yield* rowRepo.listPage({
            datasetId,
            limit: BATCH_SIZE,
            offset,
          })
          if (rows.length === 0) break
          csvChunks.push(rowsToCsvFragment(rows))
          if (rows.length < BATCH_SIZE) break
          offset += BATCH_SIZE
        }
        const csv = csvChunks.join("")
        const stream = Readable.from(Buffer.from(csv, "utf-8"))

        const fileKey = yield* putInDiskStream(disk, {
          namespace: "datasetExports",
          organizationId,
          projectId: dataset.projectId,
          datasetId,
          stream,
          extension: "csv",
        })

        const downloadUrl = yield* Effect.tryPromise({
          try: () =>
            disk.getSignedUrl(fileKey, {
              expiresIn: SIGNED_URL_EXPIRY_SECONDS,
            }),
          catch: (e: unknown) => new DatasetExportError({ cause: e }),
        })

        const rendered = yield* Effect.tryPromise({
          try: (): Promise<RenderedEmail> =>
            datasetExportTemplate({
              datasetName: dataset.name,
              downloadUrl,
            }),
          catch: (e: unknown) => new DatasetExportError({ cause: e }),
        })

        yield* sendEmailUseCase({
          to: payload.recipientEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })
      }).pipe(
        Effect.tap(() => Effect.sync(() => logger.info(`Dataset export completed: datasetId=${payload.datasetId}`))),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Dataset export failed: datasetId=${payload.datasetId}`, error)),
        ),
        withPostgres(DatasetRepositoryLive, pgClient, organizationId),
        withClickHouse(DatasetRowRepositoryLive, chClient, organizationId),
      )
    },
  }

  consumer.subscribe("dataset-export", handler)
}
