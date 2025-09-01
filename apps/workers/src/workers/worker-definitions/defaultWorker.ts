import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  createDocumentLogJob: jobs.createDocumentLogJob,
  createProviderLogJob: jobs.createProviderLogJob,
  uploadDocumentLogsJob: jobs.uploadDocumentLogsJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  downloadLogsJob: jobs.downloadLogsJob,
  createDatasetFromLogsJob: jobs.createDatasetFromLogsJob,
  notifyClientOfDatasetUpdate: jobs.notifyClientOfDatasetUpdate,
  generateProjectNameJob: jobs.generateProjectNameJob,
}

export function startDefaultWorker() {
  return createWorker(Queues.defaultQueue, jobMappings)
}
