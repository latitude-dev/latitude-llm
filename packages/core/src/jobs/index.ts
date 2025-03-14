import Redis from 'ioredis'
import { setupQueues } from './queues'
import { initializeNextRunTimesForAllScheduledTriggers } from '../services/documentTriggers/handlers/scheduled'

export { Worker } from 'bullmq'

let queues: Awaited<ReturnType<typeof setupQueues>>

export async function setupJobs(connection?: Redis) {
  if (!queues) {
    queues = await setupQueues(connection)
  }
  return queues
}

export async function setupSchedules(connection?: Redis) {
  if (!queues) {
    queues = await setupQueues(connection)
  }

  // Initialize nextRunTime for all scheduled triggers
  await initializeNextRunTimesForAllScheduledTriggers()
    .then((result) => {
      if (result.error) {
        console.error(
          'Failed to initialize nextRunTime for scheduled triggers:',
          result.error,
        )
      }
    })
    .catch((error) => {
      console.error(
        'Error initializing nextRunTime for scheduled triggers:',
        error,
      )
    })

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
}
