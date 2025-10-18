import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { stringify } from 'csv-stringify/sync'
import { and, desc, eq, isNull, lt, notInArray } from 'drizzle-orm'
import { Redis, RedisOptions } from 'ioredis'
import { Readable } from 'stream'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type User } from '../../../schema/models/types/User'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { database } from '../../../client'
import { DocumentLogFilterOptions } from '../../../constants'
import { findWorkspaceFromDocument } from '../../../data-access/workspaces'
import { diskFactory } from '../../../lib/disk'
import { NotFoundError } from '../../../lib/errors'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../../../redis'
import { commits } from '../../../schema/models/commits'
import { documentLogs } from '../../../schema/models/documentLogs'
import { providerLogs } from '../../../schema/models/providerLogs'
import { buildLogsFilterSQLConditions } from '../../../services/documentLogs/logsFilterUtils'
import { findOrCreateExport } from '../../../services/exports/findOrCreate'
import { markExportReady } from '../../../services/exports/markExportReady'
import { buildProviderLogResponse } from '../../../services/providerLogs/buildResponse'
import { hydrateProviderLog } from '../../../services/providerLogs/hydrate'

const BATCH_SIZE = 1000

export class CursorState {
  private redis: Redis | null = null
  private readonly key: string

  constructor(jobId: string) {
    this.key = `job:${jobId}:cursor`
  }

  private async ensureConnection() {
    if (!this.redis) {
      const redisOptions: RedisOptions = {
        keyPrefix: REDIS_KEY_PREFIX,
        host: env.CACHE_HOST,
        port: env.CACHE_PORT,
      }
      if (env.CACHE_PASSWORD) {
        redisOptions.password = env.CACHE_PASSWORD
      }

      this.redis = await buildRedisConnection(redisOptions)
    }
    return this.redis as Redis
  }

  async getCursor(): Promise<Date | null> {
    const redis = await this.ensureConnection()
    const cursor = await redis.get(this.key)
    return cursor ? new Date(cursor) : null
  }

  async setCursor(cursor: Date) {
    const redis = await this.ensureConnection()
    await redis.set(this.key, cursor.toISOString())
  }

  async cleanup() {
    if (this.redis) {
      await this.redis.quit()
      this.redis = null
    }
  }
}

export const downloadLogsJob = async (
  job: Job<{
    user: User
    token: string
    workspace: Workspace
    selectionMode: 'ALL' | 'ALL_EXCEPT'
    excludedDocumentLogIds: number[]
    document: DocumentVersion
    filters: Omit<DocumentLogFilterOptions, 'createdAt'> & {
      createdAt: {
        from: string | null | undefined
        to: string | null | undefined
      }
    }
  }>,
) => {
  const {
    user,
    token,
    document,
    filters,
    selectionMode,
    excludedDocumentLogIds,
  } = job.data
  let lastCreatedAt: Date | null = null
  let totalProcessed = 0
  const workspace = await findWorkspaceFromDocument(document)
  if (!workspace) {
    throw new NotFoundError('Workspace not found')
  }

  const fileKey = `workspaces/${workspace.id}/exports/${token}.csv`
  const exportRecord = await findOrCreateExport({
    uuid: token,
    workspace,
    userId: user.id,
    fileKey,
  }).then((r) => r.unwrap())

  const cursorState = new CursorState(token)
  const disk = diskFactory()

  // Create a buffer to store the CSV content
  const csvChunks: Buffer[] = []

  try {
    lastCreatedAt = await cursorState.getCursor()
    let isFirstBatch = true

    while (true) {
      // Build the query with cursor-based pagination with distinct on
      // documentLogs.uuid to ensure we only get the latest provider log per
      // document log
      const results = await database
        .selectDistinctOn([documentLogs.createdAt, documentLogs.uuid], {
          uuid: documentLogs.uuid,
          versionUuid: commits.uuid,
          duration: providerLogs.duration,
          timestamp: providerLogs.generatedAt,
          finishReason: providerLogs.finishReason,
          tokens: providerLogs.tokens,
          costInMillicents: providerLogs.costInMillicents,
          parameters: documentLogs.parameters,
          messages: providerLogs.messages,
          responseText: providerLogs.responseText,
          responseObject: providerLogs.responseObject,
          createdAt: documentLogs.createdAt,
          fileKey: providerLogs.fileKey,
        })
        .from(documentLogs)
        .innerJoin(
          providerLogs,
          eq(providerLogs.documentLogUuid, documentLogs.uuid),
        )
        .innerJoin(commits, eq(documentLogs.commitId, commits.id))
        .where(
          and(
            isNull(commits.deletedAt),
            eq(documentLogs.documentUuid, document.documentUuid),
            buildLogsFilterSQLConditions({
              ...filters,
              createdAt: filters.createdAt
                ? {
                    from: filters.createdAt.from
                      ? new Date(filters.createdAt.from)
                      : undefined,
                    to: filters.createdAt.to
                      ? new Date(filters.createdAt.to)
                      : undefined,
                  }
                : undefined,
            }),
            selectionMode === 'ALL_EXCEPT'
              ? notInArray(documentLogs.id, excludedDocumentLogIds)
              : undefined,
            lastCreatedAt
              ? lt(documentLogs.createdAt, lastCreatedAt)
              : undefined,
          ),
        )
        .orderBy(
          desc(documentLogs.createdAt),
          documentLogs.uuid,
          desc(providerLogs.generatedAt),
        )
        .limit(BATCH_SIZE)

      if (results.length === 0) {
        break
      }

      // Process the batch and write to CSV
      const csvRows = []
      for await (const row of results) {
        const providerLog = (await hydrateProviderLog(row)).unwrap()

        csvRows.push({
          documentLogUuid: row.uuid,
          versionUuid: row.versionUuid,
          timestamp: row.timestamp?.toISOString() ?? '',
          duration: row.duration,
          tokens: row.tokens ?? '',
          costInMillicents: row.costInMillicents ?? '',
          parameters: JSON.stringify(row.parameters),
          finishReason: row.finishReason ?? '',
          messages: JSON.stringify(providerLog.messages ?? row.messages),
          response: buildProviderLogResponse({
            responseText: providerLog.responseText ?? '',
            responseObject: providerLog.responseObject,
          }),
        })
      }

      // Convert the batch to CSV
      const csvString = stringify(csvRows, {
        header: isFirstBatch, // Only include headers in the first batch
      })

      // Add to buffer
      csvChunks.push(Buffer.from(csvString))

      // Update cursor and save state
      lastCreatedAt = results[results.length - 1]!.createdAt
      await cursorState.setCursor(lastCreatedAt)
      totalProcessed += results.length
      isFirstBatch = false

      // Update job progress
      const progress = Math.floor(
        (totalProcessed / (totalProcessed + BATCH_SIZE)) * 100,
      )
      await job.updateProgress(progress)

      if (results.length < BATCH_SIZE) break
    }

    // Combine all buffer chunks
    const combinedBuffer = Buffer.concat(csvChunks)

    // Create a readable stream properly - first parameter is buffer options
    const readStream = new Readable({
      highWaterMark: combinedBuffer.length,
    })

    // Push the buffer and mark end of stream
    readStream.push(combinedBuffer)
    readStream.push(null)

    const exists = await disk.exists(fileKey)
    if (exists) await disk.delete(fileKey)

    await disk
      .putStream(fileKey, readStream, {
        contentType: 'text/csv',
      })
      .then((r) => r.unwrap())

    await markExportReady({ export: exportRecord }).then((r) => r.unwrap())
  } finally {
    await cursorState.cleanup()
  }
}
