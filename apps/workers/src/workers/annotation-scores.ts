import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("annotation-scores")

export const createAnnotationScoresWorker = (consumer: QueueConsumer) => {
  consumer.subscribe("annotation-scores", {
    publish: () => Effect.sync(() => logger.info("Stub handler for annotation-scores:publish")),
  })
}
