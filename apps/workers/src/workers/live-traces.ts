import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("live-traces")

export const createLiveTracesWorker = (consumer: QueueConsumer) => {
  consumer.subscribe("live-traces", {
    end: () => Effect.sync(() => logger.info("::::: Stub handler for live-traces:end :::::")),
  })
}
