import { cache } from '../../../cache'
import { queues } from '../../queues'
import { Job } from 'bullmq'

export type ScheduleOrphanedRunsCleanupJobsData = Record<string, never>

/**
 * Job that runs nightly to schedule cleanup jobs for orphaned runs.
 *
 * This job:
 * 1. Scans Redis for all active run cache keys (runs:active:*:*)
 * 2. Extracts workspaceId and projectId from each key
 * 3. Enqueues individual cleanup jobs for each workspace/project combination
 * 4. Each cleanup job will check and remove orphaned runs for that specific workspace/project
 */
export const scheduleOrphanedRunsCleanupJobs = async (
  _: Job<ScheduleOrphanedRunsCleanupJobsData>,
) => {
  const c = await cache()
  const { maintenanceQueue } = await queues()

  // Scan for all active run cache keys
  // Pattern needs to include wildcard for Redis prefix since SCAN doesn't apply keyPrefix automatically
  const pattern = `*runs:active:*:*`
  let cursor = '0'
  const processedKeys = new Set<string>()
  let enqueuedJobs = 0

  do {
    // SCAN returns [cursor, keys]
    const [nextCursor, keys] = await c.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100,
    )
    cursor = nextCursor

    for (const key of keys) {
      // Extract workspaceId and projectId from key
      // Key format: runs:active:workspaceId:projectId (with Redis prefix)
      // Remove Redis prefix if present
      const keyWithoutPrefix = key.replace(/^latitude:/, '')
      const match = keyWithoutPrefix.match(/^runs:active:(\d+):(\d+)$/)

      if (!match) continue

      const workspaceId = parseInt(match[1], 10)
      const projectId = parseInt(match[2], 10)

      // Create unique key to avoid duplicate jobs
      const uniqueKey = `${workspaceId}:${projectId}`
      if (processedKeys.has(uniqueKey)) continue

      processedKeys.add(uniqueKey)

      // Enqueue individual cleanup job for this workspace/project
      await maintenanceQueue.add(
        'cleanupOrphanedRunsJob',
        { workspaceId, projectId },
        { attempts: 3 },
      )
      enqueuedJobs++
    }
  } while (cursor !== '0')

  console.log(`Enqueued ${enqueuedJobs} orphaned runs cleanup jobs`)
}
