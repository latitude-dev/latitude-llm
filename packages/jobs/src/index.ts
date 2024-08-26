import { buildConnection, ConnectionParams } from '$jobs/connection'
import { setupQueues } from '$jobs/queues'
import startWorkers from '$jobs/workers'

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
