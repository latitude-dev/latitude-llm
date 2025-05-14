import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const jobMappings = {
  runDocumentJob: jobs.runDocumentJob,
  runDocumentForExperimentJob: jobs.runDocumentForExperimentJob,
  runCopilotChatJob: jobs.runCopilotChatJob,
}

export function startDocumentsWorker() {
  return createWorker(Queues.documentsQueue, jobMappings, {
    concurrency: 25,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
