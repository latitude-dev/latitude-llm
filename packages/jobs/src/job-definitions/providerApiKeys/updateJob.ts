import { updateProviderApiKey } from '@latitude-data/core'
import type { ProviderApiKey } from '@latitude-data/core/browser'
import { Job } from 'bullmq'

export type UpdateApiKeyProviderJobData = {
  providerApiKey: ProviderApiKey
  lastUsedAt: string
}

export const updateProviderApiKeyJob = async (
  job: Job<UpdateApiKeyProviderJobData>,
) => {
  const { providerApiKey, lastUsedAt } = job.data

  await updateProviderApiKey({
    providerApiKey,
    lastUsedAt: new Date(lastUsedAt),
  }).then((r) => r.unwrap())
}
