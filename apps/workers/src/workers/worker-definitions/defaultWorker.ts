import { Queues } from '@latitude-data/core/jobs/constants'

import { buildProcessor } from '../_shared'

const defaultWorkerQueues = [
  Queues.defaultQueue,
  Queues.eventHandlersQueue,
  Queues.eventsQueue,
  Queues.liveEvaluationsQueue,
]

export const defaultWorker = {
  processor: buildProcessor(defaultWorkerQueues),
  queues: defaultWorkerQueues,
}
