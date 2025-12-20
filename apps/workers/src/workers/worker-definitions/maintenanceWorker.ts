import { setupLRO } from '@latitude-data/core/client'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  autoScaleJob: jobs.autoScaleJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  cleanDocumentSuggestionsJob: jobs.cleanDocumentSuggestionsJob,
  cleanupWorkspaceOldLogsJob: jobs.cleanupWorkspaceOldLogsJob,
  requestDocumentSuggestionsJob: jobs.requestDocumentSuggestionsJob,
  scaleDownMcpServerJob: jobs.scaleDownMcpServerJob,
  updateMcpServerLastUsedJob: jobs.updateMcpServerLastUsedJob,
  scheduleWeeklyEmailJobs: jobs.scheduleWeeklyEmailJobs,
  dailyAlignmentMetricUpdateJob: jobs.dailyAlignmentMetricUpdateJob,
  updateEvaluationAlignmentJob: jobs.updateEvaluationAlignmentJob,
}

export function startMaintenanceWorker() {
  setupLRO() // Setup LRO for the maintenance worker

  return createWorker(Queues.maintenanceQueue, jobMappings)
}
