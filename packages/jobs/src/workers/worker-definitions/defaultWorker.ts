import { buildProcessor } from '../_shared'
import { Queues } from '../../constants'

const defaultWorkerQueues = [
  Queues.defaultQueue,
  Queues.eventsQueue,
  Queues.eventHandlersQueue,
]

export const defaultWorker = {
  processor: buildProcessor(defaultWorkerQueues),
  queues: defaultWorkerQueues,
}
