import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("live-traces")

interface LiveTracesDeps {
  consumer: QueueConsumer
}

export const createLiveTracesWorker = ({ consumer }: LiveTracesDeps) => {
  consumer.subscribe("live-traces", {
    end: () => Effect.sync(() => logger.info("::::: Stub handler for live-traces:end :::::")),
  })
}
