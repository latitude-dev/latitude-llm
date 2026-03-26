import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("issues")

interface IssuesDeps {
  consumer: QueueConsumer
}

export const createIssuesWorker = ({ consumer }: IssuesDeps) => {
  consumer.subscribe("issues", {
    refresh: () => Effect.sync(() => logger.info("Stub handler for issues:refresh")),
  })
}
