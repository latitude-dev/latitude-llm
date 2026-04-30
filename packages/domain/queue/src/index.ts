import { type Effect, ServiceMap } from "effect"
import type { QueuePublishError, QueueSubscribeError, WorkflowAlreadyStartedError } from "./errors.ts"
import type { TopicRegistry as TR } from "./topic-registry.ts"
import type { WorkflowRegistry as WR } from "./workflow-registry.ts"

export type TopicRegistry = TR
export { TOPIC_NAMES } from "./topic-registry.ts"
export type QueueName = keyof TopicRegistry & string
export type TaskName<T extends QueueName> = string & keyof TopicRegistry[T]
export type TaskPayload<T extends QueueName, K extends TaskName<T>> = TopicRegistry[T][K]
export type TaskHandlers<T extends QueueName> = {
  [K in TaskName<T>]: (payload: TopicRegistry[T][K]) => Effect.Effect<void, unknown>
}

export type WorkflowRegistry = WR
export { WORKFLOW_NAMES } from "./workflow-registry.ts"
export type WorkflowName = keyof WorkflowRegistry & string
export type WorkflowInput<W extends WorkflowName> = WorkflowRegistry[W]

/**
 * Starts workflows by id. Workflow id is the dedupe key (analogous to
 * BullMQ's `dedupeKey`) — Temporal guarantees that two actively running
 * workflows with the same id are never possible.
 *
 * `start` fails loudly when a workflow with the same id is already running:
 * the underlying Temporal error propagates so callers can't mistake a
 * deduped call for a fresh start. Callers that may legitimately retry for
 * the same id should either query workflow state first or catch and handle
 * the already-running case explicitly.
 *
 * `signalWithStart` is idempotent against running workflows by design:
 * Temporal delivers the signal to the existing run if one exists, otherwise
 * it starts a new one. Coalescing rapid signals is the workflow's
 * responsibility.
 */
export interface WorkflowStarterShape {
  readonly start: <W extends WorkflowName>(
    workflow: W,
    input: WorkflowInput<W>,
    options: { readonly workflowId: string },
  ) => Effect.Effect<void, WorkflowAlreadyStartedError>
  readonly signalWithStart: <W extends WorkflowName>(
    workflow: W,
    input: WorkflowInput<W>,
    options: {
      readonly workflowId: string
      readonly signal: string
      readonly signalArgs?: readonly unknown[]
    },
  ) => Effect.Effect<void>
}

export class WorkflowStarter extends ServiceMap.Service<WorkflowStarter, WorkflowStarterShape>()(
  "@domain/queue/WorkflowStarter",
) {}

export type WorkflowExecutionStatus =
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "terminated"
  | "continued-as-new"
  | "timed-out"
  | "paused"
  | "unknown"

export type WorkflowDescription = {
  readonly status: WorkflowExecutionStatus
  readonly runId: string
  readonly startTime: Date
  readonly closeTime: Date | null
}

export interface WorkflowQuerierShape {
  readonly describe: (workflowId: string) => Effect.Effect<WorkflowDescription | null>
  readonly query: <T>(workflowId: string, queryName: string) => Effect.Effect<T | null>
}

export class WorkflowQuerier extends ServiceMap.Service<WorkflowQuerier, WorkflowQuerierShape>()(
  "@domain/queue/WorkflowQuerier",
) {}

export interface PublishOptions {
  readonly dedupeKey?: string
  /**
   * Debounce window in ms. Each publish within the window extends the TTL
   * and replaces the pending payload, so the task fires after `debounceMs`
   * of quiet on this `dedupeKey`. Appropriate when you want to wait for a
   * stream of events to settle (e.g. `trace-end:run` after `SpanIngested`).
   *
   * Mutually exclusive with `throttleMs`.
   */
  readonly debounceMs?: number
  /**
   * Throttle window in ms. The first publish schedules the task for
   * `now + throttleMs`; subsequent publishes within the window are dropped
   * (clock not extended, payload not replaced). Guarantees a hard upper
   * bound of `throttleMs` on fire latency from the first publish, plus a
   * maximum rate of one fire per `throttleMs` per `dedupeKey`. Appropriate
   * when you want a predictable "at most once per N" cadence even under a
   * constant flow of publishes (e.g. annotation-driven alignment refresh).
   *
   * Requires `dedupeKey`. Mutually exclusive with `debounceMs`.
   */
  readonly throttleMs?: number
  /**
   * Total attempts BullMQ should make before the job is considered failed
   * (inclusive of the first try). Set alongside `backoff` to get bounded
   * exponential retry for transient dependency failures (e.g. Temporal
   * unavailability). Without a `backoff` set, retries fire immediately.
   */
  readonly attempts?: number
  /**
   * Exponential backoff between retry attempts, in milliseconds. Delay is
   * `delayMs * 2^(attempt-1)`. Ignored when `attempts` is unset or ≤ 1.
   */
  readonly backoff?: {
    readonly type: "exponential"
    readonly delayMs: number
  }
}

export interface QueuePublisherShape {
  readonly publish: <T extends QueueName, K extends TaskName<T>>(
    queue: T,
    task: K,
    payload: TaskPayload<T, K>,
    options?: PublishOptions,
  ) => Effect.Effect<void, QueuePublishError>
  readonly close: () => Effect.Effect<void>
}

export class QueuePublisher extends ServiceMap.Service<QueuePublisher, QueuePublisherShape>()(
  "@domain/queue/QueuePublisher",
) {}

export interface SubscribeOptions {
  readonly concurrency?: number
}

export interface QueueConsumer {
  readonly start: () => Effect.Effect<void, QueueSubscribeError>
  readonly stop: () => Effect.Effect<void>
  readonly subscribe: <T extends QueueName>(queue: T, handlers: TaskHandlers<T>, options?: SubscribeOptions) => void
}

export { QueueClientError, QueuePublishError, QueueSubscribeError, WorkflowAlreadyStartedError } from "./errors.ts"
