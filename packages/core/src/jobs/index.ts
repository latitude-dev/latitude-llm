import { setupQueues } from './queues'

export { Worker } from 'bullmq'

let queues: Awaited<ReturnType<typeof setupQueues>>

export async function setupJobs() {
  if (queues) return queues
  queues = await setupQueues()

  return queues
}
