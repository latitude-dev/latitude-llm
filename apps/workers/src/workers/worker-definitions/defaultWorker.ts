import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  createDocumentLogJob: jobs.createDocumentLogJob,
  createProviderLogJob: jobs.createProviderLogJob,
  uploadDocumentLogsJob: jobs.uploadDocumentLogsJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  processScheduledTriggerJob: jobs.processScheduledTriggerJob,
  runEmailTriggerJob: jobs.runEmailTriggerJob,
  downloadLogsJob: jobs.downloadLogsJob,
  createDatasetFromLogsJob: jobs.createDatasetFromLogsJob,
  notifyClientOfDatasetUpdate: jobs.notifyClientOfDatasetUpdate,
}

export function startDefaultWorker() {
  return createWorker(Queues.defaultQueue, jobMappings)
}
