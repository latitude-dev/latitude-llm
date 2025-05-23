import { Job } from 'bullmq'
import { DocumentLogFilterOptions } from '../../../constants'
import { DocumentVersion, User } from '../../../browser'
import { Workspace } from '../../../browser'
import { database } from '../../../client'
import { documentLogs } from '../../../schema/models/documentLogs'
import { providerLogs } from '../../../schema/models/providerLogs'
import { and, eq, lt, desc, sql, inArray, notInArray } from 'drizzle-orm'
import { Redis } from 'ioredis'
import { env } from '@latitude-data/env'
import { buildRedisConnection } from '../../../redis'
import { commits } from '../../../schema/models/commits'
import { diskFactory } from '../../../lib/disk'
import { stringify } from 'csv-stringify/sync'
import { Readable } from 'stream'
import { findWorkspaceFromDocument } from '../../../data-access'
import { NotFoundError } from '../../../lib/errors'
import { buildProviderLogResponse } from '../../../services/providerLogs'
import { findOrCreateExport } from '../../../services/exports'
import { markExportReady } from '../../../services/exports/markExportReady'

const BATCH_SIZE = 1000

class CursorState {
  private redis: Redis | null = null
  private readonly key: string

  constructor(jobId: string) {
    this.key = `job:${jobId}:cursor`
  }

  private async ensureConnection() {
    if (!this.redis) {
      const redisOptions: any = {
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
    filters: DocumentLogFilterOptions
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
  const exportRecord = await findOrCreateExport({
    token,
    workspace,
    userId: user.id,
  }).then((r) => r.unwrap())

  const cursorState = new CursorState(token)
  const disk = diskFactory()
  const fileKey = `workspaces/${workspace.id}/exports/${token}.csv`

  // Create a readable stream that we can write to
  const writeStream = new Readable()

  try {
    lastCreatedAt = await cursorState.getCursor()

    const writeResult = await disk.putStream(fileKey, writeStream)
    if (writeResult.error) {
      throw new Error(
        `Failed to initialize write stream: ${writeResult.error.message}`,
      )
    }

    while (true) {
      // Build the query with cursor-based pagination
      const results = await database
        .select({
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
        })
        .from(documentLogs)
        .innerJoin(
          providerLogs,
          eq(providerLogs.documentLogUuid, documentLogs.uuid),
        )
        .innerJoin(commits, eq(documentLogs.commitId, commits.id))
        .where(
          and(
            eq(documentLogs.documentUuid, document.documentUuid),
            filters.commitIds
              ? inArray(documentLogs.commitId, filters.commitIds)
              : undefined,
            filters.createdAt?.from
              ? sql`${documentLogs.createdAt} >= ${filters.createdAt.from}`
              : undefined,
            filters.createdAt?.to
              ? sql`${documentLogs.createdAt} <= ${filters.createdAt.to}`
              : undefined,
            filters.logSources
              ? inArray(documentLogs.source, filters.logSources)
              : undefined,
            filters.customIdentifier
              ? eq(documentLogs.customIdentifier, filters.customIdentifier)
              : undefined,
            selectionMode === 'ALL_EXCEPT'
              ? notInArray(documentLogs.id, excludedDocumentLogIds)
              : undefined,
            lastCreatedAt
              ? lt(documentLogs.createdAt, lastCreatedAt)
              : undefined,
          ),
        )
        .orderBy(desc(documentLogs.createdAt))
        .limit(BATCH_SIZE)

      if (results.length === 0) break

      // Process the batch and write to CSV
      const csvRows = results.map((row) => ({
        uuid: row.uuid,
        versionUuid: row.versionUuid,
        duration: row.duration,
        timestamp: row.timestamp?.toISOString() ?? '',
        finishReason: row.finishReason ?? '',
        tokens: row.tokens ?? '',
        costInMillicents: row.costInMillicents ?? '',
        parameters: JSON.stringify(row.parameters),
        messages: JSON.stringify(row.messages),
        response: buildProviderLogResponse({
          responseText: row.responseText ?? '',
          responseObject: row.responseObject,
        }),
        createdAt: row.createdAt.toISOString(),
      }))

      // Convert the batch to CSV and write to stream
      const csvString = stringify(csvRows, {
        header: totalProcessed === 0, // Only include headers in the first batch
      })
      writeStream.push(csvString)

      console.log(results)

      // Update cursor and save state
      lastCreatedAt = results[results.length - 1]!.createdAt
      await cursorState.setCursor(lastCreatedAt)
      totalProcessed += results.length

      // Update job progress
      await job.updateProgress(
        Math.floor((totalProcessed / (totalProcessed + BATCH_SIZE)) * 100),
      )

      if (results.length < BATCH_SIZE) {
        break
      }
    }

    writeStream.push(null) // End the stream

    await markExportReady({ export: exportRecord }).then((r) => r.unwrap())

    return { totalProcessed }
  } finally {
    await cursorState.cleanup()
  }
}
