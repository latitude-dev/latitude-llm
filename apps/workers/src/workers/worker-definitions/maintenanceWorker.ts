import { setupLRO } from '@latitude-data/core/client'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'
import { WORKER_OPTIONS } from '../utils/connectionConfig'

const jobMappings = {
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  cleanDocumentSuggestionsJob: jobs.cleanDocumentSuggestionsJob,
  cleanOrphanedActiveJobsJob: jobs.cleanOrphanedActiveJobsJob,
  cleanupWorkspaceOldLogsJob: jobs.cleanupWorkspaceOldLogsJob,
  destroyWorkspaceJob: jobs.destroyWorkspaceJob,
  requestDocumentSuggestionsJob: jobs.requestDocumentSuggestionsJob,
  scheduleWeeklyEmailJobs: jobs.scheduleWeeklyEmailJobs,
  dailyAlignmentMetricUpdateJob: jobs.dailyAlignmentMetricUpdateJob,
  updateEvaluationAlignmentJob: jobs.updateEvaluationAlignmentJob,
  processCancelledSubscriptionsJob: jobs.processCancelledSubscriptionsJob,
}

export function startMaintenanceWorker() {
  setupLRO() // Setup LRO for the maintenance worker

  return createWorker(Queues.maintenanceQueue, jobMappings, {
    ...WORKER_OPTIONS,
    concurrency: 5,
  })
}
