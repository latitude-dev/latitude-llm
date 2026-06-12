import type { ActivityOptions } from "@temporalio/workflow"

/**
 * Default retry policy for activities in this app.
 *
 * Temporal's built-in default is unlimited retries with 100s-capped backoff,
 * which lets a failing activity keep a workflow "in progress" forever. This
 * policy uses 8 attempts, which gives roughly one hour of exponential retry
 * delay before the final attempt while still surfacing failures the same day.
 *
 * Workflows that throw deterministic domain errors (validation failures,
 * rate limits, not-found conditions that won't resolve with time) should
 * spread this and extend `nonRetryableErrorTypes` so those errors fail fast
 * instead of burning attempts.
 */
export const defaultActivityRetryPolicy: NonNullable<ActivityOptions["retry"]> = {
  initialInterval: "30 seconds",
  backoffCoefficient: 2,
  maximumInterval: "6 hours",
  maximumAttempts: 8,
  nonRetryableErrorTypes: ["BadRequestError"],
}
