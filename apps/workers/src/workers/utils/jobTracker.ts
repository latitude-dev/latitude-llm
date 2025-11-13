import { Worker } from 'bullmq'
import { scaleInProtectionManager } from './scaleInProtection'
import debug from '@latitude-data/core/lib/debug'

/**
 * Tracks active jobs across all BullMQ workers and manages scale-in protection
 */
export class JobTracker {
  private activeJobsCount = 0
  private workers: Worker[] = []

  /**
   * Register a worker to track its job activity
   */
  registerWorker(worker: Worker): void {
    this.workers.push(worker)

    // Listen for job start events
    worker.on('active', (job) => {
      this.activeJobsCount++
      debug(
        `Job ${job?.id || 'unknown'} started processing. Active jobs: ${this.activeJobsCount}`,
      )

      // Enable protection when first job starts
      if (this.activeJobsCount === 1) {
        scaleInProtectionManager.enableProtection()
      }
    })

    // Listen for job completion events
    worker.on('completed', (job) => {
      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1)
      debug(
        `Job ${job?.id || 'unknown'} completed. Active jobs: ${this.activeJobsCount}`,
      )

      // Disable protection when no jobs are active
      if (this.activeJobsCount === 0) {
        scaleInProtectionManager.disableProtection()
      }
    })

    // Listen for job failure events
    worker.on('failed', (job) => {
      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1)
      debug(
        `Job ${job?.id || 'unknown'} failed. Active jobs: ${this.activeJobsCount}`,
      )

      // Disable protection when no jobs are active
      if (this.activeJobsCount === 0) {
        scaleInProtectionManager.disableProtection()
      }
    })

    // Handle worker closing
    worker.on('closing', () => {
      console.log('Worker is closing, removing from tracker')
      this.workers = this.workers.filter((w) => w !== worker)
    })
  }

  /**
   * Get the current count of active jobs
   */
  getActiveJobsCount(): number {
    return this.activeJobsCount
  }

  /**
   * Get all registered workers
   */
  getWorkers(): Worker[] {
    return [...this.workers]
  }

  /**
   * Force disable protection (useful for graceful shutdown)
   */
  async forceDisableProtection(): Promise<void> {
    await scaleInProtectionManager.disableProtection()
  }
}

// Global instance
export const jobTracker = new JobTracker()
