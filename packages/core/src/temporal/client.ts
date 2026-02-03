import { Client, WorkflowHandle } from '@temporalio/client'
import { env } from '@latitude-data/env'
import { getClientConnection } from './connection-client'

let client: Client | null = null

export async function getTemporalClient(): Promise<Client> {
  if (!client) {
    const connection = await getClientConnection()
    client = new Client({
      connection,
      namespace: env.TEMPORAL_NAMESPACE,
    })
  }
  return client
}

export async function startWorkflow(
  workflowName: string,
  options: {
    workflowId: string
    taskQueue?: string
    args: unknown[]
  },
): Promise<WorkflowHandle> {
  const temporalClient = await getTemporalClient()
  return temporalClient.workflow.start(workflowName, {
    taskQueue: options.taskQueue ?? env.TEMPORAL_TASK_QUEUE,
    workflowId: options.workflowId,
    args: options.args,
  })
}

export async function signalWorkflow(
  workflowId: string,
  signalName: string,
  args: unknown[] = [],
): Promise<void> {
  const temporalClient = await getTemporalClient()
  const handle = temporalClient.workflow.getHandle(workflowId)
  await handle.signal(signalName, ...args)
}

export async function queryWorkflow<T = unknown>(
  workflowId: string,
  queryName: string,
): Promise<T> {
  const temporalClient = await getTemporalClient()
  const handle = temporalClient.workflow.getHandle(workflowId)
  return handle.query<T>(queryName)
}

export async function cancelWorkflow(workflowId: string): Promise<void> {
  const temporalClient = await getTemporalClient()
  const handle = temporalClient.workflow.getHandle(workflowId)
  await handle.cancel()
}

export async function getWorkflowHandle(
  workflowId: string,
): Promise<WorkflowHandle> {
  const temporalClient = await getTemporalClient()
  return temporalClient.workflow.getHandle(workflowId)
}

export { Client }
export type { WorkflowHandle }
