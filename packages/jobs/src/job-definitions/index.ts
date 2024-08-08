import { Jobs, Queues } from '$jobs/constants'

import { CreateDocumentLogJobData } from './documentLogs/createJob'
import { CreateProviderLogJobData } from './providerLogs/createJob'

type JobDataMap = {
  [Jobs.createProviderLogJob]: CreateProviderLogJobData
  [Jobs.createDocumentLogJob]: CreateDocumentLogJobData
}

type JobData<J extends Jobs> = J extends keyof JobDataMap
  ? JobDataMap[J]
  : never

type JobSpec<J extends Jobs = Jobs> = {
  name: J
  data: JobData<J>
}

export type JobDefinition = {
  [Queues.defaultQueue]: {
    [K in Jobs]: JobSpec<K>
  }
}
