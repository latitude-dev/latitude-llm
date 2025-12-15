import { queues } from '@latitude-data/core/queues'

export async function setupSchedules() {
  const { maintenanceQueue } = await queues()

  // Every day at 8 AM
  await maintenanceQueue.upsertJobScheduler(
    'requestDocumentSuggestionsJob',
    { pattern: '0 0 8 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every 10 minutes
  await maintenanceQueue.upsertJobScheduler(
    'autoScaleJob',
    { pattern: '*/10 * * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 2 AM
  await maintenanceQueue.upsertJobScheduler(
    'cleanDocumentSuggestionsJob',
    { pattern: '0 0 2 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every minute
  await maintenanceQueue.upsertJobScheduler(
    'checkScheduledDocumentTriggersJob',
    { pattern: '* * * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 1 AM - Removes logs older than 30 days from free plan accounts
  await maintenanceQueue.upsertJobScheduler(
    'scheduleWorkspaceCleanupJobs',
    { pattern: '0 0 1 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 2 AM - Removes logs older than 30 days from free plan accounts
  await maintenanceQueue.upsertJobScheduler(
    'scheduleMigrateSpansJobs',
    { pattern: '0 0 1 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every Monday at 1:00:00 AM - Schedule weekly email reports
  await maintenanceQueue.upsertJobScheduler(
    'scheduleWeeklyEmailJobs',
    { pattern: '0 0 1 * * 1' },
    { opts: { attempts: 1 } },
  )
}
