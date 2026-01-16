import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  createProviderLogJob: jobs.createProviderLogJob,
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  generateProjectNameJob: jobs.generateProjectNameJob,
  exportSpansJob: jobs.exportSpansJob,
}

export function startDefaultWorker() {
  return createWorker(Queues.defaultQueue, jobMappings)
}
