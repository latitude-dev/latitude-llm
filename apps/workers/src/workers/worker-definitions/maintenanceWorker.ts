import { setupLRO } from '@latitude-data/core/client'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const jobMappings = {
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  clearConversationCacheJob: jobs.clearConversationCacheJob,
  cleanupWorkspaceOldLogsJob: jobs.cleanupWorkspaceOldLogsJob,
  destroyWorkspaceJob: jobs.destroyWorkspaceJob,
  scheduleWeeklyEmailJobs: jobs.scheduleWeeklyEmailJobs,
  dailyAlignmentMetricUpdateJob: jobs.dailyAlignmentMetricUpdateJob,
  updateEvaluationAlignmentJob: jobs.updateEvaluationAlignmentJob,
  processCancelledSubscriptionsJob: jobs.processCancelledSubscriptionsJob,
}

export function startMaintenanceWorker() {
  setupLRO() // Setup LRO for the maintenance worker

  return createWorker(Queues.maintenanceQueue, jobMappings, {
    connection: WORKER_CONNECTION_CONFIG,
    concurrency: 5,
  })
}
