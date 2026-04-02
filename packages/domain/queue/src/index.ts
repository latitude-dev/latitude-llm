import { type Effect, ServiceMap } from "effect"
import type { QueuePublishError, QueueSubscribeError } from "./errors.ts"
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

export interface WorkflowStarterShape {
  readonly start: <W extends WorkflowName>(
    workflow: W,
    input: WorkflowInput<W>,
    options: { readonly workflowId: string },
  ) => Effect.Effect<void>
}

export interface PublishOptions {
  readonly dedupeKey?: string
  readonly debounceMs?: number
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

export { QueueClientError, QueuePublishError, QueueSubscribeError } from "./errors.ts"
