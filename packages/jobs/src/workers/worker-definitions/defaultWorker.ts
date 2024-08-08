import { Jobs, Queues } from '$jobs/constants'
import {
  createProviderLogJob,
  CreateProviderLogJobData,
} from '$jobs/job-definitions/providerLogs/createJob'
import { Job, Processor } from 'bullmq'

const processor: Processor = async (job) => {
  switch (job.name) {
    case Jobs.createProviderLogJob:
      return await createProviderLogJob(job as Job<CreateProviderLogJobData>)
    default:
    // do nothing
  }
}

export const defaultWorker = {
  processor,
  queueName: Queues.defaultQueue,
}
