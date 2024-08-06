import { Jobs, Queues } from '$jobs/constants'
import {
  UpdateApiKeyProviderJobData,
  updateProviderApiKeyJob,
} from '$jobs/job-definitions/providerApiKeys/updateJob'
import { Job, Processor } from 'bullmq'

const processor: Processor = async (job) => {
  switch (job.name) {
    case Jobs.updateApiKeyProviderJob:
      return await updateProviderApiKeyJob(
        job as Job<UpdateApiKeyProviderJobData>,
      )
    default:
    // do nothing
  }
}

export const defaultWorker = {
  processor,
  queueName: Queues.defaultQueue,
}
