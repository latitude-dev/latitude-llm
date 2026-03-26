import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("live-annotation-queues")

interface LiveAnnotationQueuesDeps {
  consumer: QueueConsumer
}

export const createLiveAnnotationQueuesWorker = ({ consumer }: LiveAnnotationQueuesDeps) => {
  consumer.subscribe("live-annotation-queues", {
    curate: () => Effect.sync(() => logger.info("Stub handler for live-annotation-queues:curate")),
  })
}
