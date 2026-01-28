import { cache as redis } from '@latitude-data/core/cache'

const CANCEL_JOB_FLAG_TTL = 60 * 60 // 1 hour

export async function setCancelJobFlag(jobId: string) {
  const redisClient = await redis()
  await redisClient.set(`cancel:${jobId}`, '1', 'EX', CANCEL_JOB_FLAG_TTL)
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const redisClient = await redis()
  return (await redisClient.get(`cancel:${jobId}`)) === '1'
}

export async function clearCancelJobFlag(jobId: string) {
  const redisClient = await redis()
  await redisClient.del(`cancel:${jobId}`)
}

/**
 * Creates a cancellation poller that checks for job cancellation and aborts when detected.
 * Uses O(1) Redis key lookups instead of O(n) pub/sub broadcasts.
 * @param jobId - The job ID to monitor for cancellation
 * @param abortController - The AbortController to trigger on cancellation
 * @param pollIntervalMs - How often to check for cancellation (default: 1000ms)
 * @returns A cleanup function to stop the polling
 */
export function createCancellationPoller(
  jobId: string,
  abortController: AbortController,
  pollIntervalMs: number = 1000,
): () => void {
  let isPolling = true

  const poll = async () => {
    while (isPolling && !abortController.signal.aborted) {
      try {
        const cancelled = await isJobCancelled(jobId)
        if (cancelled) {
          abortController.abort()
          break
        }
      } catch {
        // Ignore polling errors to not crash the job
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  poll()

  return () => {
    isPolling = false
  }
}
