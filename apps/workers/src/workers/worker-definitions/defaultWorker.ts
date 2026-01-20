import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  checkScheduledDocumentTriggersJob: jobs.checkScheduledDocumentTriggersJob,
  createProviderLogJob: jobs.createProviderLogJob,
  exportSpansJob: jobs.exportSpansJob,
  generateProjectNameJob: jobs.generateProjectNameJob,
}

export function startDefaultWorker() {
  return createWorker(Queues.defaultQueue, jobMappings)
}
