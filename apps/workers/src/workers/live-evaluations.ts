import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("live-evaluations")

interface LiveEvaluationsDeps {
  consumer: QueueConsumer
}

export const createLiveEvaluationsWorker = ({ consumer }: LiveEvaluationsDeps) => {
  consumer.subscribe("live-evaluations", {
    enqueue: () => Effect.sync(() => logger.info("Stub handler for live-evaluations:enqueue")),
    execute: () => Effect.sync(() => logger.info("Stub handler for live-evaluations:execute")),
  })
}
