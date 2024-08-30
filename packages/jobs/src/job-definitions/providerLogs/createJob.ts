import {
  createProviderLog,
  CreateProviderLogProps,
} from '@latitude-data/core/services/providerLogs/create'
import { Job } from 'bullmq'

export type CreateProviderLogJobData = CreateProviderLogProps

export const createProviderLogJob = async (
  job: Job<CreateProviderLogJobData>,
) => {
  await createProviderLog(job.data).then((r) => r.unwrap())
}
