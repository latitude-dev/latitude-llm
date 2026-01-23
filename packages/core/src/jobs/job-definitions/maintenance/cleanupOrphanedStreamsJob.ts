import { Job } from 'bullmq'
import { cache } from '../../../cache'
import { captureException, captureMessage } from '../../../utils/datadogCapture'

export type CleanupOrphanedStreamsJobData = Record<string, never>

const STREAM_KEY_PATTERN = 'run:active:*:stream'
const STREAM_MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes - streams older than this are orphaned
const BATCH_SIZE = 100

/**
 * Maintenance job that garbage-collects orphaned Redis streams.
 * Streams can become orphaned if jobs crash before the cleanup() method runs.
 * This job scans for old streams and deletes them to prevent memory leaks.
 */
export const cleanupOrphanedStreamsJob = async (
  _job: Job<CleanupOrphanedStreamsJobData>,
): Promise<{ cleaned: number; scanned: number }> => {
  const redis = await cache()
  let cleaned = 0
  let scanned = 0
  let cursor = '0'

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        STREAM_KEY_PATTERN,
        'COUNT',
        BATCH_SIZE,
      )
      cursor = nextCursor

      for (const key of keys) {
        scanned++

        try {
          const streamInfo = await redis.xinfo('STREAM', key).catch(() => null)
          if (!streamInfo) {
            await redis.del(key)
            cleaned++
            continue
          }

          const infoMap = parseXinfoResult(streamInfo as unknown[])
          const lastEntryId = infoMap['last-generated-id'] as string

          if (lastEntryId && lastEntryId !== '0-0') {
            const timestamp = extractTimestampFromStreamId(lastEntryId)
            const age = Date.now() - timestamp

            if (age > STREAM_MAX_AGE_MS) {
              await redis.del(key)
              cleaned++
            }
          }
        } catch (err) {
          captureException(err as Error, {
            context: 'cleanupOrphanedStreamsJob',
            key,
          })
        }
      }
    } while (cursor !== '0')

    if (cleaned > 0) {
      captureMessage(
        `Cleaned up ${cleaned} orphaned Redis streams`,
        'info',
        { scanned, cleaned },
      )
    }

    return { cleaned, scanned }
  } catch (error) {
    captureException(error as Error, {
      context: 'cleanupOrphanedStreamsJob',
    })
    throw error
  }
}

function parseXinfoResult(info: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (let i = 0; i < info.length; i += 2) {
    const key = info[i] as string
    result[key] = info[i + 1]
  }
  return result
}

function extractTimestampFromStreamId(id: string): number {
  const [timestampPart] = id.split('-')
  return parseInt(timestampPart || '0', 10)
}
