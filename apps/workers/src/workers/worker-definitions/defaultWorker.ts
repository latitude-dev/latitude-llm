import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  createDocumentLogFromSpanJob: jobs.createDocumentLogFromSpanJob,
  createDocumentLogJob: jobs.createDocumentLogJob,
  createProviderLogJob: jobs.createProviderLogJob,
  processOtlpTracesJob: jobs.processOtlpTracesJob,
  runDocumentForEvaluationJob: jobs.runDocumentForEvaluationJob,
  runDocumentInBatchJob: jobs.runDocumentInBatchJob,
  runDocumentJob: jobs.runDocumentJob,
  uploadDocumentLogsJob: jobs.uploadDocumentLogsJob,
  generateDocumentSuggestionJob: jobs.generateDocumentSuggestionJob,
  processScheduledTriggerJob: jobs.processScheduledTriggerJob,
  runEmailTriggerJob: jobs.runEmailTriggerJob,
}

export function startDefaultWorker() {
  return createWorker(Queues.defaultQueue, jobMappings)
}
