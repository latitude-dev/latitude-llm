import { Job } from 'bullmq'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { providerLogs } from '../../../schema'
import Transaction from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { diskFactory } from '../../../lib/disk'
import { ProviderLogFileData } from '../../../schema/types'
import { database } from '../../../client'

export type MigrateProviderLogsToObjectStorageJobData = {
  workspaceId: number
}

const BATCH_SIZE = 1000 // Increased from 100 for better performance
const generateProviderLogFileKey = (uuid: string): string => {
  return `provider-logs/${uuid}.json`
}

async function storeProviderLogFile(
  fileKey: string,
  data: ProviderLogFileData,
) {
  try {
    const disk = diskFactory('private')
    const content = JSON.stringify(data)
    const result = await disk.put(fileKey, content)
    return result
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Job that migrates provider logs from database columns to object storage for a specific workspace.
 *
 * This job:
 * 1. Processes provider logs in batches ordered by created_at (oldest first)
 * 2. For each log, extracts the data from database columns and stores it in object storage
 * 3. Updates the log with the fileKey and clears the data columns
 * 4. Stops when it finds the first log with fileKey (indicating migration already completed from that point)
 * 5. Uses cursor-based pagination with created_at for efficient batching
 * 6. Each log migration is processed in its own transaction for better error handling
 */
export const migrateProviderLogsToObjectStorageJob = async (
  job: Job<MigrateProviderLogsToObjectStorageJobData>,
) => {
  const { workspaceId } = job.data

  let processedLogs = 0
  let migratedLogs = 0
  let failedLogs = 0
  let migrationCompleted = false

  try {
    // Find the oldest provider log without fileKey to determine starting point
    const oldestLogResult = await (async () => {
      try {
        const result = await database
          .select({
            createdAt: providerLogs.createdAt,
          })
          .from(providerLogs)
          .where(
            and(
              eq(providerLogs.workspaceId, workspaceId),
              isNull(providerLogs.fileKey),
            ),
          )
          .orderBy(asc(providerLogs.createdAt))
          .limit(1)
          .then((r: { createdAt: Date }[]) => r[0])
        return Result.ok(result)
      } catch (e) {
        const error =
          'cause' in (e as Error) ? ((e as Error).cause as Error) : (e as Error)
        throw error
      }
    })()

    const oldestLog = oldestLogResult.unwrap()
    if (!oldestLog) {
      // No logs to migrate for this workspace
      return Result.ok({
        success: true,
        workspaceId,
        processedLogs: 0,
        migratedLogs: 0,
        failedLogs: 0,
        message: 'No provider logs to migrate for this workspace',
      })
    }

    let currentCursor = oldestLog.createdAt

    // Process logs in batches using cursor-based pagination
    while (!migrationCompleted) {
      // Get next batch of logs ordered by created_at
      const batch = await database
        .select({
          id: providerLogs.id,
          uuid: providerLogs.uuid,
          createdAt: providerLogs.createdAt,
          config: providerLogs.config,
          messages: providerLogs.messages,
          output: providerLogs.output,
          responseObject: providerLogs.responseObject,
          responseText: providerLogs.responseText,
          responseReasoning: providerLogs.responseReasoning,
          toolCalls: providerLogs.toolCalls,
        })
        .from(providerLogs)
        .where(
          and(
            eq(providerLogs.workspaceId, workspaceId),
            isNull(providerLogs.fileKey),
            sql`${providerLogs.createdAt} >= ${currentCursor}`,
          ),
        )
        .orderBy(asc(providerLogs.createdAt))
        .limit(BATCH_SIZE)

      // No more logs to process
      if (batch.length === 0) break

      // Process each log in the batch
      for (const log of batch) {
        processedLogs++

        try {
          // Prepare data for object storage
          const fileData: ProviderLogFileData = {
            config: log.config ?? null,
            messages: log.messages ?? null,
            output: log.output ?? null,
            responseObject: log.responseObject ?? null,
            responseText: log.responseText ?? null,
            responseReasoning: log.responseReasoning ?? null,
            toolCalls: log.toolCalls ?? null,
          }

          // Store in object storage
          const fileKey = generateProviderLogFileKey(log.uuid)
          const storageResult = await storeProviderLogFile(fileKey, fileData)

          if (storageResult.error) {
            failedLogs++
            console.error(
              `Failed to store provider log file for log ${log.id}:`,
              storageResult.error,
            )
            continue
          }

          // Update the database record in its own transaction
          const updateResult = await new Transaction().call(async (tx) => {
            const result = await tx
              .update(providerLogs)
              .set({
                fileKey,
                // Clear the data columns since they're now in object storage
                config: null,
                messages: [],
                output: null,
                responseObject: null,
                responseText: null,
                responseReasoning: null,
                toolCalls: [],
              })
              .where(eq(providerLogs.id, log.id))

            return Result.ok(result)
          })

          if (updateResult.error) {
            failedLogs++
            console.error(
              `Failed to update provider log ${log.id} after storing file:`,
              updateResult.error,
            )
            continue
          }

          migratedLogs++
        } catch (error) {
          failedLogs++
          console.error(`Failed to migrate provider log ${log.id}:`, error)
        }
      }

      // Check if we should continue or if we've processed all logs
      if (batch.length < BATCH_SIZE) {
        // This was the last batch
        migrationCompleted = true
      } else {
        // Move cursor to the last processed log's created_at for next batch
        // Add 1 millisecond to avoid reprocessing the same log
        const lastLog = batch[batch.length - 1]
        currentCursor = new Date(lastLog.createdAt.getTime() + 1)
      }
    }

    return Result.ok({
      success: true,
      workspaceId,
      processedLogs,
      migratedLogs,
      failedLogs,
      message: 'Migration completed successfully',
    })
  } catch (error) {
    console.error(
      `Migration failed for workspace ${workspaceId}. Error:`,
      error,
    )
    throw error
  }
}
