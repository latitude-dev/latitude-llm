import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  generateDocumentSuggestionJob: jobs.generateDocumentSuggestionJob,
}

export function startDocumentSuggestionsWorker() {
  return createWorker(Queues.documentSuggestionsQueue, jobMappings, {
    concurrency: 1, // Very low concurrency to avoid rate limiting
    connection: WORKER_CONNECTION_CONFIG,
  })
}
