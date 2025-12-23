import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  prepareOptimizationJob: jobs.prepareOptimizationJob,
  executeOptimizationJob: jobs.executeOptimizationJob,
  validateOptimizationJob: jobs.validateOptimizationJob,
}

export function startOptimizationsWorker() {
  return createWorker(Queues.optimizationsQueue, jobMappings, {
    concurrency: 25,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
