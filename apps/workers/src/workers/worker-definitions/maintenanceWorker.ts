import { setupLRO } from '@latitude-data/core/client'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  autoScaleJob: jobs.autoScaleJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  cleanDocumentSuggestionsJob: jobs.cleanDocumentSuggestionsJob,
  requestDocumentSuggestionsJob: jobs.requestDocumentSuggestionsJob,
  scaleDownMcpServerJob: jobs.scaleDownMcpServerJob,
  updateMcpServerLastUsedJob: jobs.updateMcpServerLastUsedJob,
  refreshProjectsStatsCacheJob: jobs.refreshProjectsStatsCacheJob,
  refreshProjectStatsCacheJob: jobs.refreshProjectStatsCacheJob,
  refreshDocumentsStatsCacheJob: jobs.refreshDocumentsStatsCacheJob,
  refreshDocumentStatsCacheJob: jobs.refreshDocumentStatsCacheJob,
  scheduleWorkspaceCleanupJobs: jobs.scheduleWorkspaceCleanupJobs,
  cleanupWorkspaceOldLogsJob: jobs.cleanupWorkspaceOldLogsJob,
  scheduleProviderLogsMigrationJobs: jobs.scheduleProviderLogsMigrationJobs,
}

export function startMaintenanceWorker() {
  setupLRO() // Setup LRO for the maintenance worker
  return createWorker(Queues.maintenanceQueue, jobMappings)
}
