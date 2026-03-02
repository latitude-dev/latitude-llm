import type { RedisConnection } from "@platform/cache-redis"
import { type Job, Queue, Worker } from "bullmq"
import { Effect } from "effect"

const createJobProcessor = () => (job: Job) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Processing job ${job.id} of type ${job.name}`)
    return { ok: true, jobId: job.id, eventName: job.name }
  })

export const createEventsWorker = (redisConnection: RedisConnection) => {
  const queue = new Queue("events", { connection: redisConnection })

  const worker = new Worker("events", async (job) => Effect.runPromise(createJobProcessor()(job)), {
    connection: redisConnection,
  })

  return { queue, worker }
}
