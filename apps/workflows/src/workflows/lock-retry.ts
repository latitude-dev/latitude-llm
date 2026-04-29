import { sleep } from "@temporalio/workflow"

const LOCK_RETRY_MAX_ATTEMPTS = 18
const LOCK_RETRY_INITIAL_DELAY_MS = 1_000
const LOCK_RETRY_MAX_DELAY_MS = 30_000
const LOCK_RETRY_JITTER_MIN_MS = 1_000
const LOCK_RETRY_JITTER_MAX_MS = 100_000

// Math.random() is replay-safe inside Temporal workflows (the SDK seeds it deterministically per run). Jitter
// spreads contended waiters so they do not all wake up at the same moment and re-storm the lock.
const getLockRetryDelayMs = (attempt: number) => {
  const backoff = Math.min(LOCK_RETRY_INITIAL_DELAY_MS * 2 ** (attempt - 1), LOCK_RETRY_MAX_DELAY_MS)
  const jitterRange = LOCK_RETRY_JITTER_MAX_MS - LOCK_RETRY_JITTER_MIN_MS
  const jitter = Math.floor(Math.random() * (jitterRange + 1)) + LOCK_RETRY_JITTER_MIN_MS
  return backoff + jitter
}

// Generic non-blocking lock retry: an activity that returns `{ status: "lock-unavailable" }` on contention is
// retried with exponential backoff + jitter via durable workflow sleeps. Any other status is returned to the
// caller, which discriminates the success/skipped variants itself.
export const runWithLockRetry = async <T extends { status: string }>(
  invoke: () => Promise<T>,
): Promise<Exclude<T, { status: "lock-unavailable" }>> => {
  for (let attempt = 1; attempt <= LOCK_RETRY_MAX_ATTEMPTS; attempt++) {
    const result = await invoke()
    if (result.status !== "lock-unavailable") {
      return result as Exclude<T, { status: "lock-unavailable" }>
    }

    if (attempt < LOCK_RETRY_MAX_ATTEMPTS) {
      await sleep(getLockRetryDelayMs(attempt))
    }
  }

  throw new Error(`Lock remained unavailable after ${LOCK_RETRY_MAX_ATTEMPTS} workflow retries`)
}
