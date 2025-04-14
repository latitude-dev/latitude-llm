import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  autoScaleJob: jobs.autoScaleJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  cleanDocumentSuggestionsJob: jobs.cleanDocumentSuggestionsJob,
  requestDocumentSuggestionsJob: jobs.requestDocumentSuggestionsJob,
  scaleDownMcpServerJob: jobs.scaleDownMcpServerJob,
  updateMcpServerLastUsedJob: jobs.updateMcpServerLastUsedJob,
  refreshProjectStatsCacheJob: jobs.refreshProjectStatsCacheJob,
  refreshWorkspaceProjectStatsCacheJob:
    jobs.refreshWorkspaceProjectStatsCacheJob,
}

export function startMaintenanceWorker() {
  return createWorker(Queues.maintenanceQueue, jobMappings)
}
