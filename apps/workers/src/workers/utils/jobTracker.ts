import { Queue } from 'bullmq'
import { scaleInProtectionManager } from './scaleInProtection'

/**
 * Tracks active jobs across all BullMQ queues by polling directly from Redis
 * This is the source of truth for active job counts and manages scale-in protection
 */
export class JobTracker {
  private queues: Queue[] = []
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private readonly CHECK_INTERVAL_MS = 5000 // Check every 5 seconds
  private lastActiveCount = 0

  /**
   * Register a queue to track its active jobs
   */
  registerQueue(queue: Queue): void {
    this.queues.push(queue)

    // Start polling if not already started
    if (!this.pollInterval) {
      this.startPolling()
    }
  }

  /**
   * Start polling queues for active job counts
   */
  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      await this.checkActiveJobs()
    }, this.CHECK_INTERVAL_MS)

    // Also check immediately on start
    this.checkActiveJobs().catch((error) => {
      console.error('Error during initial active jobs check:', error)
    })
  }

  /**
   * Check active jobs across all queues and manage scale-in protection
   */
  private async checkActiveJobs(): Promise<void> {
    try {
      const activeJobCounts = await Promise.all(
        this.queues.map(async (queue) => {
          const jobs = await queue.getJobs(['active'])
          return jobs.length
        }),
      )

      const totalActive = activeJobCounts.reduce((sum, count) => sum + count, 0)

      // Only log and manage protection if the count changed
      if (totalActive !== this.lastActiveCount) {
        console.log(
          `Active jobs count changed: ${this.lastActiveCount} -> ${totalActive}`,
        )

        // Enable protection when jobs become active
        if (totalActive > 0 && this.lastActiveCount === 0) {
          await scaleInProtectionManager.enableProtection()
        }

        // Disable protection when no jobs are active
        if (totalActive === 0 && this.lastActiveCount > 0) {
          await scaleInProtectionManager.disableProtection()
        }

        this.lastActiveCount = totalActive
      }
    } catch (error) {
      console.error('Error checking active jobs:', error)
    }
  }

  /**
   * Get the current count of active jobs (from last poll)
   */
  getActiveJobsCount(): number {
    return this.lastActiveCount
  }

  /**
   * Get an up-to-date count of active jobs by polling queues immediately
   */
  async getActiveJobsCountNow(): Promise<number> {
    try {
      const activeJobCounts = await Promise.all(
        this.queues.map(async (queue) => {
          const jobs = await queue.getJobs(['active'])
          return jobs.length
        }),
      )

      return activeJobCounts.reduce((sum, count) => sum + count, 0)
    } catch (error) {
      console.error('Error getting active jobs count:', error)
      return this.lastActiveCount // Fallback to cached value
    }
  }

  /**
   * Get all registered queues
   */
  getQueues(): Queue[] {
    return [...this.queues]
  }

  /**
   * Force disable protection (useful for graceful shutdown)
   */
  async forceDisableProtection(): Promise<void> {
    await scaleInProtectionManager.disableProtection()
  }

  /**
   * Stop polling (useful for graceful shutdown)
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
      console.log('Job tracker polling stopped')
    }
  }
}

// Global instance
export const jobTracker = new JobTracker()
