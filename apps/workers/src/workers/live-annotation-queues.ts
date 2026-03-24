import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("live-annotation-queues")

export const createLiveAnnotationQueuesWorker = (consumer: QueueConsumer) => {
  consumer.subscribe("live-annotation-queues", {
    curate: () => Effect.sync(() => logger.info("Stub handler for live-annotation-queues:curate")),
  })
}
