import type { QueueName } from "@domain/queue"
import type { Job } from "bullmq"

/** Context for a BullMQ job failure after handler or worker processing (observable / alerting). */
export type BullMqFailedJobContext = {
  readonly id: string | undefined
  readonly task: string
  readonly attemptsMade: number
  readonly attemptsConfigured: number
  readonly willRetry: boolean
}

/**
 * Worker-level incidents: infrastructure errors, job failures (including stall/remove edge cases), and stalls.
 * Use `onWorkerIncident` on the consumer config to forward to logs, metrics, or APM; failures still follow BullMQ retry settings.
 */
export type BullMqWorkerIncident =
  | { readonly kind: "worker_error"; readonly queue: QueueName; readonly error: Error }
  | {
      readonly kind: "job_failed"
      readonly queue: QueueName
      readonly job: BullMqFailedJobContext | undefined
      readonly error: Error
    }
  | { readonly kind: "job_stalled"; readonly queue: QueueName; readonly jobId: string }

export const failedJobContextFromJob = (job: Job | undefined): BullMqFailedJobContext | undefined => {
  if (!job) {
    return undefined
  }
  const attemptsConfigured = typeof job.opts.attempts === "number" ? job.opts.attempts : (job.opts.attempts ?? 1)
  const attemptsMade = job.attemptsMade
  const willRetry = attemptsMade < attemptsConfigured
  return {
    id: job.id,
    task: job.name,
    attemptsMade,
    attemptsConfigured,
    willRetry,
  }
}
