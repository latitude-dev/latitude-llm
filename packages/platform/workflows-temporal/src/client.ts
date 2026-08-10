import { inspect } from "node:util"
import {
  WorkflowAlreadyStartedError,
  type WorkflowDescription,
  type WorkflowExecutionStatus,
  type WorkflowQuerierShape,
  type WorkflowStarterShape,
  type WorkflowTerminatorShape,
} from "@domain/queue"
import { createLogger } from "@repo/observability"
import type { WorkflowExecutionStatusName } from "@temporalio/client"
import { Client, Connection, WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client"
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

// Temporal nests the failure (WorkflowFailedError -> ActivityFailure ->
// ApplicationFailure); the outer wrappers are generic, so return the deepest
// cause's message — the actual reason the activity threw.
export const resolveWorkflowFailureReason = (error: unknown): string | null => {
  let current: unknown = error
  let reason: string | null = null
  const seen = new Set<unknown>()

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    const message = toNonEmptyString(current.message)
    if (message !== undefined && message !== OPAQUE_TEMPORAL_ERROR_MESSAGE) {
      reason = message
    }
    current = current.cause
  }

  return reason
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

const mapWorkflowStatus = (name: WorkflowExecutionStatusName): WorkflowExecutionStatus => {
  switch (name) {
    case "RUNNING":
      return "running"
    case "COMPLETED":
      return "completed"
    case "FAILED":
      return "failed"
    case "CANCELLED":
      return "canceled"
    case "TERMINATED":
      return "terminated"
    case "CONTINUED_AS_NEW":
      return "continued-as-new"
    case "TIMED_OUT":
      return "timed-out"
    case "PAUSED":
      return "paused"
    default:
      return "unknown"
  }
}

export function createWorkflowQuerier(client: Client): WorkflowQuerierShape {
  return {
    describe: (workflowId) =>
      Effect.promise(async (): Promise<WorkflowDescription | null> => {
        try {
          const handle = client.workflow.getHandle(workflowId)
          const description = await handle.describe()
          const status = mapWorkflowStatus(description.status.name)

          // `describe()` lacks the failure reason; `result()` rejects with it.
          // Only for failed runs, so the common path stays a single RPC.
          let failure: string | null = null
          if (status === "failed") {
            try {
              await handle.result()
            } catch (error) {
              failure = resolveWorkflowFailureReason(error)
            }
          }

          return {
            status,
            runId: description.runId,
            startTime: description.startTime,
            closeTime: description.closeTime ?? null,
            failure,
          }
        } catch (error) {
          if (error instanceof WorkflowNotFoundError) {
            return null
          }
          throw error
        }
      }),
    query: <T>(workflowId: string, queryName: string) =>
      Effect.promise(async (): Promise<T | null> => {
        try {
          return (await client.workflow.getHandle(workflowId).query<T, []>(queryName)) as T
        } catch (error) {
          if (error instanceof WorkflowNotFoundError) {
            return null
          }
          throw error
        }
      }),
  }
}

export function createWorkflowStarter(client: Client, config: TemporalConfig): WorkflowStarterShape {
  return {
    start: (workflow, input, options) =>
      // `workflowId` is the dedupe key (analogous to BullMQ's `dedupeKey`).
      // FAIL makes a duplicate start against a *running* workflow raise
      // `WorkflowExecutionAlreadyStartedError` deterministically, and
      // ALLOW_DUPLICATE lets a start against a *closed* workflow open a
      // fresh run (so retries and subsequent refresh cycles keep working).
      //
      // We translate the duplicate-start exception into the tagged
      // `WorkflowAlreadyStartedError` from `@domain/queue` so callers
      // that use `workflowId` as an idempotency key (retried server fns
      // against record-creating use-cases) can recover via
      // `Effect.catchTag` instead of catching a Temporal-typed
      // exception. Real failures (network, permission, etc.) still
      // propagate as defects via `Effect.promise`.
      Effect.promise(async () => {
        try {
          const handle = await client.workflow.start(workflow, {
            workflowId: options.workflowId,
            taskQueue: config.taskQueue,
            args: [input],
            workflowIdReusePolicy: "ALLOW_DUPLICATE",
            workflowIdConflictPolicy: "FAIL",
            ...(options.startDelayMs === undefined ? {} : { startDelay: options.startDelayMs }),
          })
          logger.info("started workflow", {
            workflow,
            workflowId: options.workflowId,
            runId: handle.firstExecutionRunId,
            startDelayMs: options.startDelayMs,
          })
          return { kind: "started" as const }
        } catch (error) {
          if (error instanceof WorkflowExecutionAlreadyStartedError) {
            logger.info("workflow already started", {
              workflow,
              workflowId: options.workflowId,
            })
            return { kind: "already-started" as const }
          }
          throw error
        }
      }).pipe(
        Effect.flatMap((result) =>
          result.kind === "already-started"
            ? Effect.fail(new WorkflowAlreadyStartedError({ workflow, workflowId: options.workflowId }))
            : Effect.void,
        ),
      ),
    signalWithStart: (workflow, input, options) =>
      Effect.promise(async () => {
        // `signalWithStart` is idempotent against running workflows: Temporal
        // delivers the signal to the existing run if one exists (the
        // `USE_EXISTING` semantic is implicit for this RPC) and otherwise
        // starts a new one. Workflow-internal handlers are responsible for
        // coalescing/deduping rapid signals. Keep the closed-id reuse policy
        // aligned with `start` so a completed workflow id can be analyzed
        // again while preserving the implicit signal-existing-run behavior.
        const handle = await client.workflow.signalWithStart(workflow, {
          workflowId: options.workflowId,
          workflowIdReusePolicy: "ALLOW_DUPLICATE",
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

/**
 * Hard-stop a running workflow (e.g. a facet garden the user chose to stop or
 * refine). Best-effort: a workflow that finished or was GC'd between the user's
 * click and this call is treated as already stopped.
 */
export function createWorkflowTerminator(client: Client): WorkflowTerminatorShape {
  return {
    terminate: (workflowId, reason) =>
      Effect.promise(async () => {
        try {
          await client.workflow.getHandle(workflowId).terminate(reason)
        } catch (error) {
          if (error instanceof WorkflowNotFoundError) return
          // A completed/terminated workflow can't be terminated again. Nothing to stop.
          const message = error instanceof Error ? error.message.toLowerCase() : ""
          if (message.includes("completed") || message.includes("not found") || message.includes("terminated")) return
          throw error
        }
      }),
  }
}
