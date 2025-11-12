import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { database } from '../../../client'
import { queues } from '../../queues'

export type ScheduleUpdateEvaluationResultsSpanReferencesJobsData = Record<
  string,
  never
>

/**
 * Job that runs daily to schedule individual span reference update jobs for all workspaces.
 *
 * This job:
 * 1. Finds all workspaces
 * 2. Enqueues individual span reference update jobs for each workspace
 * 3. Each individual job will update evaluation results with missing span references
 */
export const scheduleUpdateEvaluationResultsSpanReferencesJobs = async (
  _: Job<ScheduleUpdateEvaluationResultsSpanReferencesJobsData>,
) => {
  // Find all workspaces
  const allWorkspaces = await database
    .select({
      id: workspaces.id,
    })
    .from(workspaces)

  let enqueuedJobs = 0

  // Enqueue individual span reference update job for each workspace
  for (const workspace of allWorkspaces) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'updateEvaluationResultsSpanReferencesJob',
      { workspaceId: workspace.id },
      { attempts: 3 },
    )
    enqueuedJobs++
  }

  return {
    message: `Successfully scheduled ${enqueuedJobs} individual workspace span reference update jobs`,
    enqueuedJobs,
  }
}
