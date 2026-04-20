import { inspect } from "node:util"
import type { WorkflowStarterShape } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { Data, Effect } from "effect"
import type { TemporalConfig } from "./config.ts"

const logger = createLogger("workflows-temporal-client")

const OPAQUE_TEMPORAL_ERROR_MESSAGE = "undefined undefined: undefined"

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const toSerializableValue = (value: unknown, depth = 0): unknown => {
  if (depth >= 4) {
    return typeof value === "object" && value !== null ? `[${value.constructor?.name ?? "Object"}]` : value
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value
  }

  if (value === undefined) {
    return "[undefined]"
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializableValue(item, depth + 1))
  }

  if (value instanceof Error) {
    const record: Record<string, unknown> = {
      constructorName: value.constructor.name,
      name: value.name,
      message: value.message,
    }

    if (value.stack) record.stack = value.stack
    if ("cause" in value && value.cause !== undefined) {
      record.cause = toSerializableValue(value.cause, depth + 1)
    }

    for (const key of Object.keys(value)) {
      record[key] = toSerializableValue(value[key as keyof Error], depth + 1)
    }

    return record
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toSerializableValue(entry, depth + 1)]))
  }

  return String(value)
}

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    const message = toNonEmptyString(error.message)
    const causeMessage = "cause" in error ? formatUnknownError(error.cause) : undefined

    if (message !== undefined && message !== OPAQUE_TEMPORAL_ERROR_MESSAGE) {
      return causeMessage ? `${message} (cause: ${causeMessage})` : message
    }

    if (causeMessage) {
      return causeMessage
    }

    return toNonEmptyString(error.name) ?? OPAQUE_TEMPORAL_ERROR_MESSAGE
  }

  if (isRecord(error)) {
    const message = toNonEmptyString(error.message)
    const code = toNonEmptyString(error.code)
    const details = toNonEmptyString(error.details)
    const causeMessage = "cause" in error ? formatUnknownError(error.cause) : undefined
    const pieces = [message, code, details, causeMessage ? `cause: ${causeMessage}` : undefined].filter(
      (value): value is string => value !== undefined && value !== OPAQUE_TEMPORAL_ERROR_MESSAGE,
    )

    if (pieces.length > 0) {
      return pieces.join(" | ")
    }
  }

  return String(error)
}

export class TemporalConnectionError extends Data.TaggedError("TemporalConnectionError")<{
  readonly message: string
}> {}

export const createTemporalClientEffect = (config: TemporalConfig): Effect.Effect<Client, TemporalConnectionError> => {
  const useCloud = config.apiKey !== undefined && config.apiKey.length > 0
  const connectionMetadata = {
    address: config.address,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    tlsEnabled: useCloud,
    apiKeyPresent: useCloud,
  }

  return Effect.sync(() => {
    logger.info("connecting Temporal client", connectionMetadata)
  }).pipe(
    Effect.flatMap(() =>
      Effect.tryPromise({
        try: () =>
          Connection.connect({
            address: config.address,
            ...(useCloud ? { tls: true as const, apiKey: config.apiKey } : {}),
          }),
        catch: (error) => {
          logger.error({
            operation: "connectTemporalClient",
            temporal: connectionMetadata,
            rawError: toSerializableValue(error),
            inspectedRawError: inspect(error, { depth: 8, breakLength: 120 }),
          })

          return new TemporalConnectionError({
            message: `Failed to connect to Temporal at ${config.address} (namespace ${config.namespace}): ${formatUnknownError(error)}`,
          })
        },
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
    signalWithStart: (workflow, input, options) =>
      Effect.promise(async () => {
        const handle = await client.workflow.signalWithStart(workflow, {
          workflowId: options.workflowId,
          taskQueue: config.taskQueue,
          args: [input],
          signal: options.signal,
          signalArgs: [...(options.signalArgs ?? [])],
        })
        logger.info("signaled workflow with start fallback", {
          workflow,
          workflowId: options.workflowId,
          signal: options.signal,
          runId: handle.signaledRunId,
        })
      }),
  }
}
