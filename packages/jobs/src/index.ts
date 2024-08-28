import { buildConnection, ConnectionParams } from './connection'
import { setupQueues } from './queues'
import startWorkers from './workers'

export { Worker } from 'bullmq'

export function setupJobs({
  connectionParams,
}: {
  connectionParams: ConnectionParams
}) {
  const connection = buildConnection(connectionParams)
  const queues = setupQueues({ connection })

  return { queues }
}

export function setupWorkers({
  connectionParams,
}: {
  connectionParams: ConnectionParams
}) {
  const connection = buildConnection(connectionParams)
  return startWorkers({ connection })
}
