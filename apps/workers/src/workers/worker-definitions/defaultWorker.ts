import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  createDocumentLogFromSpan: jobs.createDocumentLogFromSpanJob,
  createDocumentLog: jobs.createDocumentLogJob,
  createProviderLog: jobs.createProviderLogJob,
  processOtlpTraces: jobs.processOtlpTracesJob,
  runBatchEvaluation: jobs.runBatchEvaluationJob,
  runDocumentForEvaluation: jobs.runDocumentForEvaluationJob,
  runDocumentInBatch: jobs.runDocumentInBatchJob,
  runDocument: jobs.runDocumentJob,
  uploadDocumentLogs: jobs.uploadDocumentLogsJob,
  generateDocumentSuggestion: jobs.generateDocumentSuggestionJob,
  requestDocumentSuggestions: jobs.requestDocumentSuggestionsJob,
  checkScheduledDocumentTriggers: jobs.checkScheduledDocumentTriggersJob,
  processScheduledTrigger: jobs.processScheduledTriggerJob,
  runEmailTrigger: jobs.runEmailTriggerJob,
}

export function startDefaultWorker() {
  return createWorker(Queues.defaultQueue, jobMappings)
}
