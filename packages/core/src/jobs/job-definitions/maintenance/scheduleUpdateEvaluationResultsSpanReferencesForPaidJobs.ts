import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { STRIPE_PLANS } from '../../../plans'
import { database } from '../../../client'
import { queues } from '../../queues'

export type ScheduleUpdateEvaluationResultsSpanReferencesForPaidJobsData =
  Record<string, never>

/**
 * Job that runs daily to schedule individual span reference update jobs for workspaces on paid plans.
 *
 * This job:
 * 1. Finds all workspaces with paid subscription plans
 * 2. Enqueues individual span reference update jobs for each workspace
 * 3. Each individual job will update evaluation results with missing span references
 */
export const scheduleUpdateEvaluationResultsSpanReferencesForPaidJobs = async (
  _: Job<ScheduleUpdateEvaluationResultsSpanReferencesForPaidJobsData>,
) => {
  // Find all workspaces with paid plans
  const paidWorkspaces = await database
    .select({
      id: workspaces.id,
    })
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(subscriptions.id, workspaces.currentSubscriptionId),
    )
    .where(inArray(subscriptions.plan, STRIPE_PLANS))

  let enqueuedJobs = 0

  // Enqueue individual span reference update job for each paid workspace
  for (const workspace of paidWorkspaces) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'updateEvaluationResultsSpanReferencesJob',
      { workspaceId: workspace.id },
      { attempts: 3 },
    )
    enqueuedJobs++
  }

  return {
    message: `Successfully scheduled ${enqueuedJobs} individual workspace span reference update jobs for paid plans`,
    enqueuedJobs,
  }
}
