import { setupQueues } from './queues'
import startWorkers from './workers'

export { Worker } from 'bullmq'

let queues: ReturnType<typeof setupQueues>
export function setupJobs() {
  if (queues) return queues
  queues = setupQueues()

  return queues
}

export function setupWorkers() {
  return startWorkers()
}
