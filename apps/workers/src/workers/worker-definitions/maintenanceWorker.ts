import { setupLRO } from '@latitude-data/core/client'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  autoScaleJob: jobs.autoScaleJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  cleanDocumentSuggestionsJob: jobs.cleanDocumentSuggestionsJob,
  cleanupWorkspaceOldLogsJob: jobs.cleanupWorkspaceOldLogsJob,
  refreshDocumentStatsCacheJob: jobs.refreshDocumentStatsCacheJob,
  refreshDocumentsStatsCacheJob: jobs.refreshDocumentsStatsCacheJob,
  refreshProjectStatsCacheJob: jobs.refreshProjectStatsCacheJob,
  refreshProjectsStatsCacheJob: jobs.refreshProjectsStatsCacheJob,
  requestDocumentSuggestionsJob: jobs.requestDocumentSuggestionsJob,
  scaleDownMcpServerJob: jobs.scaleDownMcpServerJob,
  scheduleWorkspaceCleanupJobs: jobs.scheduleWorkspaceCleanupJobs,
  updateMcpServerLastUsedJob: jobs.updateMcpServerLastUsedJob,

  // Migrate provider logs to object storage
  scheduleProviderLogsMigrationJobs: jobs.scheduleProviderLogsMigrationJobs,
  migrateProviderLogsToObjectStorageJob: jobs.migrateProviderLogsToObjectStorageJob,

  // Migrate document logs workspace ids
  scheduleWorkspaceLogsMigrationJobs: jobs.scheduleWorkspaceLogsMigrationJobs,
  migrateWorkspaceLogsJob: jobs.migrateWorkspaceLogsJob,
}

export function startMaintenanceWorker() {
  setupLRO() // Setup LRO for the maintenance worker
  return createWorker(Queues.maintenanceQueue, jobMappings)
}
