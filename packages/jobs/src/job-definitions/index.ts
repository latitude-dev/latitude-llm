import { LatitudeEvent } from '@latitude-data/core/events/events.d'

import { Jobs, Queues } from '../constants'

// TODO: fix these types
export type JobDataMap = {
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
