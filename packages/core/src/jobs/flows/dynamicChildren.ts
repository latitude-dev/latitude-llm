import { Job, Queue, WaitingChildrenError } from 'bullmq'
import { queues } from '../queues'
import { Queues } from '../queues/types'
import { FlowStep } from './types'

type QueuesMap = Awaited<ReturnType<typeof queues>>

const QUEUE_KEY_MAP: Record<Queues, keyof QueuesMap> = {
  [Queues.defaultQueue]: 'defaultQueue',
  [Queues.evaluationsQueue]: 'evaluationsQueue',
  [Queues.eventHandlersQueue]: 'eventHandlersQueue',
  [Queues.eventsQueue]: 'eventsQueue',
  [Queues.maintenanceQueue]: 'maintenanceQueue',
  [Queues.notificationsQueue]: 'notificationsQueue',
  [Queues.webhooksQueue]: 'webhooksQueue',
  [Queues.documentsQueue]: 'documentsQueue',
  [Queues.tracingQueue]: 'tracingQueue',
  [Queues.latteQueue]: 'latteQueue',
  [Queues.runsQueue]: 'runsQueue',
  [Queues.issuesQueue]: 'issuesQueue',
  [Queues.generateEvaluationsQueue]: 'generateEvaluationsQueue',
  [Queues.optimizationsQueue]: 'optimizationsQueue',
}

function getQueue(allQueues: QueuesMap, queueType: Queues): Queue {
  const key = QUEUE_KEY_MAP[queueType]
  return allQueues[key]
}

const RESUME_FLAG = '__dynamicChildren_resumed'

/**
 * Context for jobs that can dynamically add child steps within a flow.
 *
 * This enables the pattern where a job can add additional steps that must
 * complete before the flow continues. The added steps become children of
 * the current job, and the job waits for them to complete.
 *
 * @example
 * ```typescript
 * export const iterativeJob = async (job: Job, token?: string) => {
 *   const ctx = DynamicChildrenContext.create(job, token)
 *   if (!ctx) throw new Error('Token required')
 *
 *   // Check if resuming after children completed
 *   if (ctx.isResume()) {
 *     const childResults = await ctx.getChildrenResults()
 *     return { phase: 'completed', childResults }
 *   }
 *
 *   // Do work and decide if more steps needed
 *   const result = await doWork()
 *
 *   if (needsMoreWork(result)) {
 *     await ctx.addFlowStep({
 *       name: 'iterativeJob',
 *       queue: Queues.defaultQueue,
 *       data: { previousResult: result },
 *     })
 *   }
 *
 *   // Throws WaitingChildrenError if steps were added
 *   await ctx.waitForChildren()
 *
 *   return { result }
 * }
 * ```
 */
export class DynamicChildrenContext {
  private job: Job
  private token: string
  private stepsAdded = false

  private constructor(job: Job, token: string) {
    this.job = job
    this.token = token
  }

  /**
   * Create a context for the current job.
   * Returns undefined if token is not provided (required for waiting).
   */
  static create(job: Job, token?: string): DynamicChildrenContext | undefined {
    if (!token) return undefined
    return new DynamicChildrenContext(job, token)
  }

  /**
   * Check if this invocation is a resume after children completed.
   * Use this to differentiate between initial execution and post-children resume.
   */
  isResume(): boolean {
    return this.job.data?.[RESUME_FLAG] === true
  }

  /**
   * Get results from child jobs (only valid after resume).
   * Returns a record keyed by `queueName:jobId`.
   */
  async getChildrenResults(): Promise<Record<string, unknown>> {
    return this.job.getChildrenValues()
  }

  /**
   * Add a step that will run before this job completes.
   * The current job will wait for this step to finish.
   *
   * Multiple steps can be added - they will run in parallel.
   * If you need sequential execution, have each step add the next one.
   */
  async addFlowStep(step: FlowStep): Promise<void> {
    const allQueues = await queues()
    const queue = getQueue(allQueues, step.queue)

    await queue.add(step.name, step.data, {
      ...step.opts,
      parent: {
        id: this.job.id!,
        queue: this.job.queueQualifiedName,
      },
    })

    this.stepsAdded = true
  }

  /**
   * Add multiple steps (they will run in parallel).
   */
  async addFlowSteps(steps: FlowStep[]): Promise<void> {
    for (const step of steps) {
      await this.addFlowStep(step)
    }
  }

  /**
   * Wait for all dynamically added children to complete.
   *
   * IMPORTANT: Call this at the END of your job handler.
   * If steps were added, this throws WaitingChildrenError.
   * The job handler will be called again when children complete.
   */
  async waitForChildren(): Promise<void> {
    if (!this.stepsAdded) return

    await this.job.updateData({
      ...this.job.data,
      [RESUME_FLAG]: true,
    })

    const shouldWait = await this.job.moveToWaitingChildren(this.token)
    if (shouldWait) {
      throw new WaitingChildrenError()
    }
  }

  /**
   * Check if any steps have been added in this invocation.
   */
  hasAddedSteps(): boolean {
    return this.stepsAdded
  }

  /**
   * Get the current job's ID.
   */
  get jobId(): string | undefined {
    return this.job.id
  }

  /**
   * Get the current job's data.
   */
  get jobData(): Record<string, unknown> {
    return this.job.data
  }
}
