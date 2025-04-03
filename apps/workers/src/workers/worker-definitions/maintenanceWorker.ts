import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  autoScale: jobs.autoScaleJob,
  cleanDocumentSuggestions: jobs.cleanDocumentSuggestionsJob,
  scaleDownMcpServer: jobs.scaleDownMcpServerJob,
  updateMcpServerLastUsed: jobs.updateMcpServerLastUsedJob,
}

export function startMaintenanceWorker() {
  return createWorker(Queues.maintenanceQueue, jobMappings)
}
