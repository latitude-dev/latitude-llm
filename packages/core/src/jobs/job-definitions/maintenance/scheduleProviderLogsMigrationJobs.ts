import { Job } from 'bullmq'
import { database } from '../../../client'
import { workspaces } from '../../../schema'
import { queues } from '../../queues'

export type ScheduleProviderLogsMigrationJobsData = Record<string, never>

/**
 * Job that schedules provider logs migration jobs for all workspaces.
 *
 * This job:
 * 1. Finds all workspaces that have provider logs without fileKey (old format)
 * 2. Enqueues individual migration jobs for each workspace
 * 3. Each migration job will process provider logs in batches and migrate them to object storage
 */
export const scheduleProviderLogsMigrationJobs = async (
  _: Job<ScheduleProviderLogsMigrationJobsData>,
) => {
  // Find workspaces that have provider logs without fileKey
  const workspacesWithOldLogs = await database
    .select({ id: workspaces.id })
    .from(workspaces)

  let enqueuedJobs = 0

  // Enqueue individual migration job for each workspace
  for (const workspace of workspacesWithOldLogs) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'migrateProviderLogsToObjectStorageJob',
      { workspaceId: workspace.id },
      { attempts: 3 },
    )

    enqueuedJobs++
  }

  return {
    success: true,
    workspacesWithOldLogsCount: workspacesWithOldLogs.length,
    enqueuedJobs,
  }
}
