import type { QueueConsumer, QueueName, TaskHandlers } from "@domain/queue"
import { Effect } from "effect"

type AnyTaskHandlers = Record<string, (payload: unknown) => Effect.Effect<void, unknown>>

export class TestQueueConsumer implements QueueConsumer {
  private readonly registered = new Map<QueueName, AnyTaskHandlers>()

  subscribe<T extends QueueName>(queue: T, handlers: TaskHandlers<T>): void {
    this.registered.set(queue, handlers as unknown as AnyTaskHandlers)
  }

  start() {
    return Effect.void
  }

  stop() {
    return Effect.void
  }

  getRegisteredQueues(): QueueName[] {
    return [...this.registered.keys()]
  }

  getRegisteredTasks(queue: QueueName): string[] {
    const handlers = this.registered.get(queue)
    return handlers ? Object.keys(handlers) : []
  }

  async dispatchTask(queue: QueueName, task: string, payload: unknown): Promise<void> {
    const handlers = this.registered.get(queue)
    if (!handlers) throw new Error(`No handlers registered for queue ${queue}`)
    const handler = handlers[task]
    if (!handler) throw new Error(`No handler for task ${task} on queue ${queue}`)
    await Effect.runPromise(handler(payload))
  }

  dispatchTaskEffect(queue: QueueName, task: string, payload: unknown): Effect.Effect<void, unknown> {
    const handlers = this.registered.get(queue)
    if (!handlers) throw new Error(`No handlers registered for queue ${queue}`)
    const handler = handlers[task]
    if (!handler) throw new Error(`No handler for task ${task} on queue ${queue}`)
    return handler(payload)
  }
}
