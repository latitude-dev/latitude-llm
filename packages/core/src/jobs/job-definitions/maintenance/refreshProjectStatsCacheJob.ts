import { Job } from 'bullmq'

import { database } from '../../../client'
import { workspaces } from '../../../schema'
import { maintenanceQueue } from '../../queues'

export type RefreshProjectStatsCacheJobData = Record<string, never>

/**
 * Job that schedules project stats cache refresh for all workspaces
 *
 * This job:
 * 1. Gets all workspaces from the database
 * 2. Creates a separate refreshWorkspaceProjectStatsCacheJob for each workspace
 * 3. Distributes the work across multiple jobs to avoid timeouts
 */
export const refreshProjectStatsCacheJob = async (
  _: Job<RefreshProjectStatsCacheJobData>,
) => {
  // Get all workspaces
  const allWorkspaces = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .then((result) => result)

  // Enqueue a job for each workspace
  const jobPromises = allWorkspaces.map((workspace) =>
    maintenanceQueue.add('refreshWorkspaceProjectStatsCacheJob', {
      workspaceId: workspace.id,
    }),
  )

  await Promise.all(jobPromises)

  return { success: true, workspacesProcessed: allWorkspaces.length }
}
