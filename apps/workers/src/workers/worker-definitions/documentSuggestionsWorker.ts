import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const CONCURRENCY = 1 // Very low concurrency to avoid rate limiting

const jobMappings = {
  generateDocumentSuggestionJob: jobs.generateDocumentSuggestionJob,
}

export function startDocumentSuggestionsWorker() {
  return createWorker(Queues.documentSuggestionsQueue, jobMappings, {
    workerOptions: {
      concurrency: CONCURRENCY,
      connection: WORKER_CONNECTION_CONFIG,
    },
    maxConcurrency: CONCURRENCY,
  })
}
