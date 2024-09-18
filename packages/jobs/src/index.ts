import { setupQueues } from './queues'

export { Worker } from 'bullmq'

let queues: ReturnType<typeof setupQueues>
export function setupJobs() {
  if (queues) return queues
  queues = setupQueues()

  return queues
}
