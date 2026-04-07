import type { WorkflowStarterShape } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { Data, Effect } from "effect"
import type { TemporalConfig } from "./config.ts"

const logger = createLogger("workflows-temporal-client")

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export class TemporalConnectionError extends Data.TaggedError("TemporalConnectionError")<{
  readonly message: string
}> {}

export const createTemporalClientEffect = (config: TemporalConfig): Effect.Effect<Client, TemporalConnectionError> => {
  const useCloud = config.apiKey !== undefined && config.apiKey.length > 0

  return Effect.sync(() => {
    logger.info("connecting Temporal client", {
      address: config.address,
      namespace: config.namespace,
    })
  }).pipe(
    Effect.flatMap(() =>
      Effect.tryPromise({
        try: () =>
          Connection.connect({
            address: config.address,
            ...(useCloud ? { tls: true as const, apiKey: config.apiKey } : {}),
          }),
        catch: (error) =>
          new TemporalConnectionError({
            message: formatUnknownError(error),
          }),
      }),
    ),
    Effect.map((connection) => new Client({ connection, namespace: config.namespace })),
  )
}

export const createTemporalClient = (config: TemporalConfig): Promise<Client> => {
  return Effect.runPromise(createTemporalClientEffect(config))
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
