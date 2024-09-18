import { Queues } from '@latitude-data/jobs/constants'

import { buildProcessor } from '../_shared'

const defaultWorkerQueues = [
  Queues.defaultQueue,
  Queues.eventHandlersQueue,
  Queues.eventsQueue,
]

export const defaultWorker = {
  processor: buildProcessor(defaultWorkerQueues),
  queues: defaultWorkerQueues,
}
