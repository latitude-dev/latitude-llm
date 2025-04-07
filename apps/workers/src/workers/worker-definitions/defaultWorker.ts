import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  createDocumentLogFromSpanJob: jobs.createDocumentLogFromSpanJob,
  createDocumentLogJob: jobs.createDocumentLogJob,
  createProviderLogJob: jobs.createProviderLogJob,
  processOtlpTracesJob: jobs.processOtlpTracesJob,
  uploadDocumentLogsJob: jobs.uploadDocumentLogsJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  processScheduledTriggerJob: jobs.processScheduledTriggerJob,
  runEmailTriggerJob: jobs.runEmailTriggerJob,

  // TODO: temporary until we have processed all remaining jobs, will be removed
  runDocumentJob: jobs.runDocumentJob,
  requestDocumentSuggestionsJob: jobs.requestDocumentSuggestionsJob,
}

export function startDefaultWorker() {
  return createWorker(Queues.defaultQueue, jobMappings)
}
