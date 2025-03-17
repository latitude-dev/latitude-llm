import { Queues } from '@latitude-data/core/jobs/constants'

import { buildProcessor } from '../_shared'

const evaluationsWorkerQueues = [Queues.evaluationsQueue]

export const evaluationsWorker = {
  processor: buildProcessor(evaluationsWorkerQueues),
  queues: evaluationsWorkerQueues,
}
