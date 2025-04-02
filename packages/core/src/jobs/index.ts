import { setupQueues } from './queues'

export { Worker } from 'bullmq'
export { setupQueues } from './queues'

export async function setupSchedules() {
  const queues = await setupQueues()

  // Every day at 8 AM
  await queues.defaultQueue.jobs.scheduleRequestDocumentSuggestionsJob(
    '0 0 8 * * *',
    { attempts: 1 },
  )

  // Every day at 2 AM
  await queues.maintenanceQueue.jobs.scheduleCleanDocumentSuggestionsJob(
    '0 0 2 * * *',
    { attempts: 1 },
  )

  // Every minute
  await queues.defaultQueue.jobs.scheduleCheckScheduledDocumentTriggersJob(
    '* * * * *',
    { attempts: 1 },
  )

  // Every 10 minutes
  await queues.maintenanceQueue.jobs.scheduleAutoScaleJob('*/10 * * * *', {
    attempts: 1,
  })
}
