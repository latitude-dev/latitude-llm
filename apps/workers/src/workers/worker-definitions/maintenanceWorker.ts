import { setupLRO } from '@latitude-data/core/client'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const jobMappings = {
  autoScaleJob: jobs.autoScaleJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  cleanDocumentSuggestionsJob: jobs.cleanDocumentSuggestionsJob,
  cleanupWorkspaceOldLogsJob: jobs.cleanupWorkspaceOldLogsJob,
  migrateActiveRunsCacheJob: jobs.migrateActiveRunsCacheJob,
  refreshDocumentStatsCacheJob: jobs.refreshDocumentStatsCacheJob,
  refreshDocumentsStatsCacheJob: jobs.refreshDocumentsStatsCacheJob,
  refreshProjectStatsCacheJob: jobs.refreshProjectStatsCacheJob,
  refreshProjectsStatsCacheJob: jobs.refreshProjectsStatsCacheJob,
  requestDocumentSuggestionsJob: jobs.requestDocumentSuggestionsJob,
  scaleDownMcpServerJob: jobs.scaleDownMcpServerJob,
  scheduleUpdateEvaluationResultsSpanReferencesJobs:
    jobs.scheduleUpdateEvaluationResultsSpanReferencesJobs,
  updateEvaluationResultsSpanReferencesJob:
    jobs.updateEvaluationResultsSpanReferencesJob,
  updateMcpServerLastUsedJob: jobs.updateMcpServerLastUsedJob,
}

export function startMaintenanceWorker() {
  setupLRO() // Setup LRO for the maintenance worker

  return createWorker(Queues.maintenanceQueue, jobMappings, {
    concurrency: 10,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
