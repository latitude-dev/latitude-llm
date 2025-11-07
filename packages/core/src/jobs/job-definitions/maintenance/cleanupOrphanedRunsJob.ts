import { ACTIVE_RUNS_CACHE_KEY } from '@latitude-data/constants'
import { cache } from '../../../cache'
import { queues } from '../../queues'
import { Job } from 'bullmq'
import { endRun } from '../../../services/runs/end'

export type CleanupOrphanedRunsJobData = {
  workspaceId: number
  projectId: number
}

/**
 * Job that detects and cleans up orphaned runs for a specific workspace/project.
 *
 * Orphaned runs are runs that exist in cache but don't have corresponding BullMQ jobs.
 * This can happen when:
 * - Worker crashes before reaching finally block
 * - endRun() fails due to lock contention or Redis connection issues
 * - Job is manually removed but cache cleanup fails
 *
 * The job:
 * 1. Checks the active runs cache for the given workspace/project
 * 2. For each run, checks if BullMQ job exists
 * 3. If job doesn't exist and run is older than threshold (1 day), marks it as ended
 */
export const cleanupOrphanedRunsJob = async (
  job: Job<CleanupOrphanedRunsJobData>,
) => {
  const { workspaceId, projectId } = job.data
  const { runsQueue } = await queues()
  const c = await cache()

  // Get active runs from cache
  const cacheKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const cacheData = await c.get(cacheKey)

  if (!cacheData) return

  const activeRuns = JSON.parse(cacheData) as Record<
    string,
    { uuid: string; queuedAt: string }
  >

  let orphanedRuns = 0
  const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 1 day

  // Check each run
  for (const [runUuid, run] of Object.entries(activeRuns)) {
    // Check if run is old enough to be considered orphaned
    const queuedAt = new Date(run.queuedAt)
    const age = Date.now() - queuedAt.getTime()

    if (age < ORPHAN_THRESHOLD_MS) {
      // Run is too recent, skip it (might still be processing)
      continue
    }

    // Check if BullMQ job exists
    const bullJob = await runsQueue.getJob(runUuid)
    if (bullJob?.id) {
      // Job exists, not orphaned
      continue
    }

    // Job doesn't exist and run is old enough - it's orphaned
    // Clean it up by calling endRun (which removes from cache)
    try {
      await endRun({
        workspaceId,
        projectId,
        runUuid,
      })
      orphanedRuns++
    } catch (error) {
      // Log error but continue processing other runs
      console.error(
        `Failed to cleanup orphaned run ${runUuid} in workspace ${workspaceId}, project ${projectId}:`,
        error,
      )
    }
  }

  if (orphanedRuns > 0) {
    console.log(
      `Cleaned up ${orphanedRuns} orphaned runs in workspace ${workspaceId}, project ${projectId}`,
    )
  }
}
