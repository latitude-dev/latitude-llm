import { Jobs, Queues } from '$jobs/constants'

import { CreateProviderLogJobData } from './providerLogs/createJob'

type JobData<J extends Jobs> = J extends Jobs.createProviderLogJob
  ? CreateProviderLogJobData
  : never

type JobSpec<J extends Jobs = Jobs> = {
  name: J
  data: JobData<J>
}

export type JobDefinition = {
  [Queues.defaultQueue]: {
    [Jobs.createProviderLogJob]: JobSpec<Jobs.createProviderLogJob>
  }
}
