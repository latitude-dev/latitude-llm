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

  // Every day at 3 AM
  await maintenanceQueue.upsertJobScheduler(
    'refreshProjectsStatsCacheJob',
    { pattern: '0 0 3 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 4 AM
  await maintenanceQueue.upsertJobScheduler(
    'refreshDocumentsStatsCacheJob',
    { pattern: '0 0 4 * * *' },
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

  // Every day at 11 AM CEST - Upgrade Hobby users to HobbyV3
  await maintenanceQueue.upsertJobScheduler(
    'upgradeHobbyUsersToV3Job',
    { pattern: '0 10 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 30th minute of 11 AM CEST - Grant unlimited seats to Team users
  await maintenanceQueue.upsertJobScheduler(
    'grantUnlimitedSeatsToTeamUsersJob',
    { pattern: '0 10 30 * *' },
    { opts: { attempts: 1 } },
  )
}
