import { Queues } from '@latitude-data/core'

import { buildProcessor } from '../_shared'

const evaluationsWorkerQueues = [Queues.evaluationsQueue]

export const evaluationsWorker = {
  processor: buildProcessor(evaluationsWorkerQueues),
  queues: evaluationsWorkerQueues,
}
