import type { WorkflowStarterShape } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { Effect } from "effect"
import type { TemporalConfig } from "./config.ts"

const logger = createLogger("workflows-temporal-client")

export async function createTemporalClient(config: TemporalConfig): Promise<Client> {
  const useCloud = config.apiKey !== undefined && config.apiKey.length > 0

  logger.info("connecting Temporal client", {
    address: config.address,
    namespace: config.namespace,
  })

  const connection = await Connection.connect({
    address: config.address,
    ...(useCloud ? { tls: true as const, apiKey: config.apiKey } : {}),
  })

  return new Client({ connection, namespace: config.namespace })
}

export function createWorkflowStarter(client: Client, config: TemporalConfig): WorkflowStarterShape {
  return {
    start: (workflow, input, options) =>
      Effect.promise(async () => {
        try {
          const handle = await client.workflow.start(workflow, {
            workflowId: options.workflowId,
            taskQueue: config.taskQueue,
            args: [input],
          })
          logger.info("started workflow", {
            workflow,
            workflowId: options.workflowId,
            runId: handle.firstExecutionRunId,
          })
        } catch (error) {
          if (error instanceof WorkflowExecutionAlreadyStartedError) {
            logger.info("workflow already started", {
              workflow,
              workflowId: options.workflowId,
            })
            return
          }
          throw error
        }
      }),
  }
}
