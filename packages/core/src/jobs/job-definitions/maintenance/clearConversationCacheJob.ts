import { Job } from 'bullmq'
import { diskFactory } from '../../../lib/disk'
import { CONVERSATION_CACHE_PREFIX } from '../../../services/conversations/cache'
import { FSDriver } from 'flydrive/drivers/fs'
import { promises as fs } from 'fs'
import { join } from 'path'
import { Result } from '../../../lib/Result'

export type ClearConversationCacheJobData = Record<string, never>

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * Clears cached conversations older than 1 hour from disk.
 */
export async function clearConversationCacheJob(
  _: Job<ClearConversationCacheJobData>,
) {
  const diskWrapper = diskFactory('private')
  const disk = (diskWrapper as any).disk

  // For FSDriver, we can use filesystem operations to check file ages
  if (disk.driver instanceof FSDriver) {
    const basePath = (disk.driver as any).config.location
    const cachePath = join(basePath, CONVERSATION_CACHE_PREFIX)

    try {
      const now = Date.now()
      const cutoffTime = now - ONE_HOUR_MS

      await clearOldFilesRecursive(cachePath, cutoffTime)
      return Result.nil()
    } catch (error) {
      // If directory doesn't exist, that's fine
      if ((error as any).code === 'ENOENT') return Result.nil()
      return Result.error(error as Error)
    }
  }

  // For other drivers (S3, GCS), we'd need to implement their specific list APIs
  // For now, fall back to clearing everything (original behavior)
  return diskWrapper.deleteAll(CONVERSATION_CACHE_PREFIX)
}

async function clearOldFilesRecursive(
  dirPath: string,
  cutoffTime: number,
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      await clearOldFilesRecursive(fullPath, cutoffTime)
      // Try to remove directory if empty
      try {
        await fs.rmdir(fullPath)
      } catch {
        // Directory not empty, that's fine
      }
    } else if (entry.isFile()) {
      const stats = await fs.stat(fullPath)
      if (stats.mtimeMs < cutoffTime) {
        await fs.unlink(fullPath)
      }
    }
  }
}
