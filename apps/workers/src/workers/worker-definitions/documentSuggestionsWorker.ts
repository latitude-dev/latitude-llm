import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_OPTIONS } from '../utils/connectionConfig'

const jobMappings = {
  generateDocumentSuggestionJob: jobs.generateDocumentSuggestionJob,
}

export function startDocumentSuggestionsWorker() {
  return createWorker(Queues.documentSuggestionsQueue, jobMappings, {
    ...WORKER_OPTIONS,
    concurrency: 1, // Very low concurrency to avoid rate limiting
  })
}
