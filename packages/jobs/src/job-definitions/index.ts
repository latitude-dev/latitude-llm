import { LatitudeEvent } from '@latitude-data/core/events/handlers/index'

import { Jobs, Queues } from '../constants'
import { CreateDocumentLogJobData } from './documentLogs/createJob'
import { CreateProviderLogJobData } from './providerLogs/createJob'

export type JobDataMap = {
  [Jobs.createProviderLogJob]: CreateProviderLogJobData
  [Jobs.createDocumentLogJob]: CreateDocumentLogJobData
  [Jobs.publishEventJob]: LatitudeEvent
}

type JobData<J extends Jobs> = J extends keyof JobDataMap
  ? JobDataMap[J]
  : never

type JobSpec<J extends Jobs = Jobs> = {
  name: J
  data: JobData<J>
}

export type JobDefinition = {
  [K in Queues]: {
    [K in Jobs]: JobSpec<K>
  }
}

export * from './documentLogs/createJob'
export * from './providerLogs/createJob'
