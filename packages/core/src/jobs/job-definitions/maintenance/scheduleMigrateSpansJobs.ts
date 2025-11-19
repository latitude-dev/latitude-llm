import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { database } from '../../../client'
import { queues } from '../../queues'

export type ScheduleMigrateSpansJobsData = Record<string, never>

/**
 * Job that runs to schedule migration jobs for all workspaces.
 *
 * This job:
 * 1. Finds all workspaces
 * 2. Enqueues individual migration jobs for each workspace
 * 3. Each migration job will populate project_id in spans from commits
 */
export const scheduleMigrateSpansJobs = async (
  _: Job<ScheduleMigrateSpansJobsData>,
) => {
  // Find all workspaces
  const allWorkspaces = await database
    .select({
      id: workspaces.id,
    })
    .from(workspaces)
    .then((r) => r)

  let _enqueuedJobs = 0

  // Enqueue individual migration job for each workspace
  for (const workspace of allWorkspaces) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'migrateSpansProjectIdJob',
      { workspaceId: workspace.id },
      { attempts: 3 },
    )
    _enqueuedJobs++
  }
}
