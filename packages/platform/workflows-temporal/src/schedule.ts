import { createLogger } from "@repo/observability"
import { type Client, ScheduleAlreadyRunning, ScheduleOverlapPolicy } from "@temporalio/client"
import { Effect } from "effect"
import type { TemporalConfig } from "./config.ts"

const logger = createLogger("workflows-temporal-schedule")

export interface EnsureScheduleInput {
  /** Stable id; re-running `ensureSchedule` with the same id is a no-op. */
  readonly scheduleId: string
  readonly workflowType: string
  /** Standard cron expression(s), e.g. an every-6-hours pattern. */
  readonly cronExpressions: readonly string[]
  readonly args?: readonly unknown[]
  /**
   * Overlap policy for late/long runs. Defaults to SKIP so a still-running
   * action is never doubled up by the next tick.
   */
  readonly overlap?: ScheduleOverlapPolicy
}

/**
 * Idempotently create a Temporal Schedule that starts `workflowType` on a cron.
 *
 * Create-if-absent: an existing schedule with the same id is left untouched
 * (logged, not failed), so bootstrap is safe to run on every worker start.
 * Changing the spec/action of a live schedule is an explicit operator action
 * (`client.schedule.getHandle(id).update(...)`), not something we silently do
 * on deploy.
 */
export const ensureSchedule = (
  client: Client,
  config: TemporalConfig,
  input: EnsureScheduleInput,
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      await client.schedule.create({
        scheduleId: input.scheduleId,
        spec: { cronExpressions: [...input.cronExpressions] },
        action: {
          type: "startWorkflow",
          workflowType: input.workflowType,
          taskQueue: config.taskQueue,
          args: [...(input.args ?? [])],
        },
        policies: {
          overlap: input.overlap ?? ScheduleOverlapPolicy.SKIP,
        },
      })
      logger.info("created Temporal schedule", {
        scheduleId: input.scheduleId,
        workflowType: input.workflowType,
        cronExpressions: input.cronExpressions,
      })
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  }).pipe(
    Effect.catchIf(
      (error) => error instanceof ScheduleAlreadyRunning,
      () =>
        Effect.sync(() => {
          logger.info("Temporal schedule already exists; leaving spec untouched", {
            scheduleId: input.scheduleId,
          })
        }),
    ),
  )
