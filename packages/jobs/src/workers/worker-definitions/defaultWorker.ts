import { Job, Processor } from 'bullmq'

import { Jobs, Queues } from '../../constants'
import {
  createDocumentLogJob,
  CreateDocumentLogJobData,
} from '../../job-definitions/documentLogs/createJob'
import {
  createProviderLogJob,
  CreateProviderLogJobData,
} from '../../job-definitions/providerLogs/createJob'

const processor: Processor = async (job) => {
  switch (job.name) {
    case Jobs.createProviderLogJob:
      return await createProviderLogJob(job as Job<CreateProviderLogJobData>)
    case Jobs.createDocumentLogJob:
      return await createDocumentLogJob(job as Job<CreateDocumentLogJobData>)
    default:
    // do nothing
  }
}

export const defaultWorker = {
  processor,
  queueName: Queues.defaultQueue,
}
