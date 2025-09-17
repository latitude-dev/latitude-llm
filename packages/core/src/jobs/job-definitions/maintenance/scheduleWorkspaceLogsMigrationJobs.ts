import { Job } from 'bullmq'
import { database } from '../../../client'
import { workspaces } from '../../../schema'
import { queues } from '../../queues'

export type ScheduleWorkspaceLogsMigrationJobsData = Record<string, never>

/**
 * Job that schedules per-workspace migration jobs to backfill workspaceId
 * on document_logs and provider_logs tables for rows where it is null.
 *
 * This job:
 * 1. Finds all non-deleted workspaces
 * 2. Enqueues a migrateWorkspaceLogsJob for each workspace
 */
export const scheduleWorkspaceLogsMigrationJobs = async (
  _: Job<ScheduleWorkspaceLogsMigrationJobsData>,
) => {
  const allWorkspaces = await database
    .select({ id: workspaces.id })
    .from(workspaces)

  let enqueued = 0
  for (const ws of allWorkspaces) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'migrateWorkspaceLogsJob',
      { workspaceId: ws.id },
      { attempts: 1 },
    )

    enqueued++
  }

  return { success: true, workspaces: allWorkspaces.length, enqueued }
}
