import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("system-annotation-queues")

interface SystemAnnotationQueuesDeps {
  consumer: QueueConsumer
}

export const createSystemAnnotationQueuesWorker = ({ consumer }: SystemAnnotationQueuesDeps) => {
  consumer.subscribe("system-annotation-queues", {
    flag: () => Effect.sync(() => logger.info("Stub handler for system-annotation-queues:flag")),
    annotate: () => Effect.sync(() => logger.info("Stub handler for system-annotation-queues:annotate")),
  })
}
