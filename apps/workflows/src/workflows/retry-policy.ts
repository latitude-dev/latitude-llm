import type { ActivityOptions } from "@temporalio/workflow"

/**
 * Default retry policy for activities in this app.
 *
 * Temporal's built-in default is unlimited retries with 100s-capped backoff,
 * which lets a failing activity keep a workflow "in progress" forever. This
 * policy caps attempts at 5 with backoff up to 1 minute between tries.
 *
 * Workflows that throw deterministic domain errors (validation failures,
 * rate limits, not-found conditions that won't resolve with time) should
 * spread this and extend `nonRetryableErrorTypes` so those errors fail fast
 * instead of burning attempts.
 */
export const defaultActivityRetryPolicy: NonNullable<ActivityOptions["retry"]> = {
  initialInterval: "1 second",
  backoffCoefficient: 2,
  maximumInterval: "1 minute",
  maximumAttempts: 5,
}
