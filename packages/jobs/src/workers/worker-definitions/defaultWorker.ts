import { Jobs, Queues } from '$jobs/constants'
import {
  createDocumentLogJob,
  CreateDocumentLogJobData,
} from '$jobs/job-definitions/documentLogs/createJob'
import {
  createProviderLogJob,
  CreateProviderLogJobData,
} from '$jobs/job-definitions/providerLogs/createJob'
import { Job, Processor } from 'bullmq'

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
