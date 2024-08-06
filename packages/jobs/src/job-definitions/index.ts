import { Jobs, Queues } from '$jobs/constants'

import { UpdateApiKeyProviderJobData } from './providerApiKeys/updateJob'

type JobData<J extends Jobs> = J extends Jobs.updateApiKeyProviderJob
  ? UpdateApiKeyProviderJobData
  : never

type JobSpec<J extends Jobs = Jobs> = {
  name: J
  data: JobData<J>
}

export type JobDefinition = {
  [Queues.defaultQueue]: {
    [Jobs.updateApiKeyProviderJob]: JobSpec<Jobs.updateApiKeyProviderJob>
  }
}
