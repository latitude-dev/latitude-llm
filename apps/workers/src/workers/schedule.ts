import { queues } from '@latitude-data/core/queues'

export async function setupSchedules() {
  const { maintenanceQueue } = await queues()

  // Every minute
  await maintenanceQueue.upsertJobScheduler(
    'checkScheduledDocumentTriggersJob',
    { pattern: '* * * * *' },
    { opts: { attempts: 1 } },
  )

  await maintenanceQueue.upsertJobScheduler(
    'clearConversationCacheJob',
    { pattern: '0 */30 * * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 1 AM - Removes logs older than 30 days from free plan accounts
  await maintenanceQueue.upsertJobScheduler(
    'scheduleWorkspaceCleanupJobs',
    { pattern: '0 0 1 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every Monday at 1:00:00 AM - Schedule weekly email reports
  await maintenanceQueue.upsertJobScheduler(
    'scheduleWeeklyEmailJobs',
    { pattern: '0 0 1 * * 1' },
    { opts: { attempts: 1 } },
  )

  // Every day at 1 AM - Updates the alignment metric of evaluations
  await maintenanceQueue.upsertJobScheduler(
    'dailyAlignmentMetricUpdateJob',
    { pattern: '0 0 1 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 2 AM - Notify workspaces whose free trial ends in exactly 10 days
  await maintenanceQueue.upsertJobScheduler(
    'notifyWorkspacesFinishingFreeTrialJob',
    { pattern: '0 0 2 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 3 AM - Process cancelled subscriptions and downgrade workspaces
  await maintenanceQueue.upsertJobScheduler(
    'processCancelledSubscriptionsJob',
    { pattern: '0 0 3 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 4 AM - Manage weekly partitions for evaluation_results_v2
  await maintenanceQueue.upsertJobScheduler(
    'manageEvaluationResultsPartitionsJob',
    { pattern: '0 0 4 * * *' },
    { opts: { attempts: 1 } },
  )
}
