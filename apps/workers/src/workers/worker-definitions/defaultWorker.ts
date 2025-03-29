import { Queues } from '@latitude-data/core'

import { buildProcessor } from '../_shared'

const defaultWorkerQueues = [
  Queues.defaultQueue,
  Queues.eventHandlersQueue,
  Queues.eventsQueue,
  Queues.liveEvaluationsQueue,
  Queues.maintenanceQueue,
  Queues.webhooksQueue,
]

export const defaultWorker = {
  processor: buildProcessor(defaultWorkerQueues),
  queues: defaultWorkerQueues,
}
