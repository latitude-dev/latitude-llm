import { csvExportHeader, DatasetRepository, DatasetRowRepository, rowsToCsvFragment } from "@domain/datasets"
import { datasetExportTemplate, type EmailSender, type RenderedEmail, sendEmail } from "@domain/email"
import type { MessageHandler, QueueConsumer, QueueMessage } from "@domain/queue"
import { DatasetId, OrganizationId, putInDisk, type StorageDiskPort } from "@domain/shared"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { DatasetRowRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { DatasetRepositoryLive, type PostgresClient, withPostgres } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { createStorageDisk } from "@platform/storage-object"
import { createLogger } from "@repo/observability"
import { Data, Effect } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"
import { parseDatasetExportPayload } from "./dataset-export-payload.ts"

class DatasetExportError extends Data.TaggedError("DatasetExportError")<{
  readonly cause: unknown
}> {}

const logger = createLogger("dataset-export")

const BATCH_SIZE = 1000
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60

interface DatasetExportWorkerDependencies {
  readonly postgresClient?: PostgresClient
  readonly clickhouseClient?: ClickHouseClient
  readonly disk?: StorageDiskPort
  readonly emailSender?: EmailSender
  readonly logger?: Pick<typeof logger, "info" | "error">
}

export const createDatasetExportWorker = (consumer: QueueConsumer, deps: DatasetExportWorkerDependencies = {}) => {
  const pgClient = deps.postgresClient ?? getPostgresClient()
  const chClient = deps.clickhouseClient ?? getClickhouseClient()
  const disk = deps.disk ?? createStorageDisk()
  const emailSender = deps.emailSender ?? createEmailTransportSender()
  const sendEmailUseCase = sendEmail({ emailSender })
  const workerLogger = deps.logger ?? logger

  const handler: MessageHandler = {
    handle: (message: QueueMessage) => {
      const payload = parseDatasetExportPayload(message.body)
      if (!payload) {
        workerLogger.error("Dataset export: failed to parse payload")
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
        const csvBytes = new TextEncoder().encode(csv)

        const fileKey = yield* putInDisk(disk, {
          namespace: "datasetExports",
          organizationId,
          projectId: dataset.projectId,
          datasetId,
          content: csvBytes,
          extension: "csv",
        })

        const downloadUrl = yield* Effect.tryPromise({
          try: async (): Promise<string> =>
            String(
              await disk.getSignedUrl(fileKey, {
                expiresIn: SIGNED_URL_EXPIRY_SECONDS,
              }),
            ),
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
        Effect.tap(() =>
          Effect.sync(() => workerLogger.info(`Dataset export completed: datasetId=${payload.datasetId}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => workerLogger.error(`Dataset export failed: datasetId=${payload.datasetId}`, error)),
        ),
        withPostgres(DatasetRepositoryLive, pgClient, organizationId),
        withClickHouse(DatasetRowRepositoryLive, chClient, organizationId),
      )
    },
  }

  consumer.subscribe("dataset-export", handler)
}
