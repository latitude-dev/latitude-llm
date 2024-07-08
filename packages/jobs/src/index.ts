import { buildConnection, ConnectionParams } from '$jobs/connection'
import { setupQueues } from '$jobs/queues'

export function setupJobs({
  connectionParams,
}: {
  connectionParams: ConnectionParams
}) {
  const connection = buildConnection(connectionParams)
  const queues = setupQueues({ connection })

  return { queues }
}
