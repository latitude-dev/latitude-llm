import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("system-annotation-queues")

export const createSystemAnnotationQueuesWorker = (consumer: QueueConsumer) => {
  consumer.subscribe("system-annotation-queues", {
    flag: () => Effect.sync(() => logger.info("Stub handler for system-annotation-queues:flag")),
    annotate: () => Effect.sync(() => logger.info("Stub handler for system-annotation-queues:annotate")),
  })
}
