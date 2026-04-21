import type { ActivityOptions } from "@temporalio/workflow"

/**
 * Default retry policy for activities in this app.
 *
 * Temporal's built-in default is unlimited retries with 100s-capped backoff,
 * which lets a failing activity keep a workflow "in progress" forever. This
 * policy spreads 18 attempts over roughly two days (~50h cumulative) so the
 * exponential backoff outlives a deploy cycle — an operator has time to ship
 * a fix while the workflow is still eligible to retry and pick it up.
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
  maximumAttempts: 18,
}
