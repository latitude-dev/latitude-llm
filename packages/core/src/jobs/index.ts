import { setupQueues } from './queues'

export { setupQueues } from './queues'
export { Worker } from 'bullmq'

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
}
