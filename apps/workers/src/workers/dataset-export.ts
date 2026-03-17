import { Readable } from "node:stream"
import { csvExportHeader, DatasetRepository, DatasetRowRepository, rowsToCsvFragment } from "@domain/datasets"
import { datasetExportTemplate, type RenderedEmail, sendEmail } from "@domain/email"
import { DatasetId, OrganizationId, putInDiskStream } from "@domain/shared"
import { DatasetRowRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createPostgresClient, DatasetRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { Topics } from "@platform/queue-redpanda"
import { createStorageDisk } from "@platform/storage-object"
import { createLogger } from "@repo/observability"
import { Data, Effect } from "effect"
import type { Kafka } from "kafkajs"
import { getClickhouseClient } from "../clients.ts"
import { parseDatasetExportPayload } from "./dataset-export-payload.ts"

class DatasetExportError extends Data.TaggedError("DatasetExportError")<{
  readonly cause: unknown
}> {}

const logger = createLogger("dataset-export")

const BATCH_SIZE = 1000
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60

export const createDatasetExportWorker = (kafka: Kafka, groupId: string) => {
  const topic = Topics.datasetExport
  const consumer = kafka.consumer({ groupId })
  const pgClient = createPostgresClient()
  const chClient = getClickhouseClient()
  const disk = createStorageDisk()
  const emailSender = createEmailTransportSender()
  const sendEmailUseCase = sendEmail({ emailSender })

  let isRunning = false
  let runPromise: Promise<void> | undefined

  const start = async (): Promise<void> => {
    await consumer.connect()
    await consumer.subscribe({ topic })

    isRunning = true

    runPromise = consumer
      .run({
        eachMessage: async ({ message }) => {
          if (!isRunning) return

          const { value } = message
          if (!value) {
            logger.error("Dataset export: received message with null value")
            return
          }

          const payload = parseDatasetExportPayload(value)
          if (!payload) {
            logger.error("Dataset export: failed to parse payload")
            return
          }

          const organizationId = OrganizationId(payload.organizationId)
          const datasetId = DatasetId(payload.datasetId)

          try {
            await Effect.runPromise(
              Effect.gen(function* () {
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
                withPostgres(DatasetRepositoryLive, pgClient, organizationId),
                withClickHouse(DatasetRowRepositoryLive, chClient, organizationId),
              ),
            )
            logger.info(`Dataset export completed: datasetId=${payload.datasetId}`)
          } catch (error) {
            logger.error(`Dataset export failed: datasetId=${payload.datasetId}`, error)
            throw error
          }
        },
      })
      .catch((error) => {
        logger.error(`Dataset export worker crashed: ${error}`)
      })
  }

  const stop = async (): Promise<void> => {
    isRunning = false
    await consumer.disconnect()
    await runPromise
  }

  return { start, stop }
}
