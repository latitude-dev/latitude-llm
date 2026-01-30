import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job, WaitingChildrenError } from 'bullmq'
import { DynamicChildrenContext } from './dynamicChildren'
import { Queues } from '../queues/types'

vi.mock('../queues', () => {
  const mockAdd = vi.fn()
  const mockQueue = { add: mockAdd }
  return {
    queues: vi.fn().mockResolvedValue({
      defaultQueue: mockQueue,
      documentsQueue: mockQueue,
      evaluationsQueue: mockQueue,
      eventHandlersQueue: mockQueue,
      eventsQueue: mockQueue,
      maintenanceQueue: mockQueue,
      notificationsQueue: mockQueue,
      tracingQueue: mockQueue,
      webhooksQueue: mockQueue,
      latteQueue: mockQueue,
      runsQueue: mockQueue,
      issuesQueue: mockQueue,
      generateEvaluationsQueue: mockQueue,
      optimizationsQueue: mockQueue,
    }),
    __mockAdd: mockAdd,
  }
})

describe('DynamicChildrenContext', () => {
  let mockJob: Partial<Job>
  let mockQueueAdd: ReturnType<typeof vi.fn>
  const TEST_TOKEN = 'test-token'
  const TEST_JOB_ID = 'test-job-id'
  const TEST_QUEUE_NAME = 'bull:test-queue'

  beforeEach(async () => {
    vi.clearAllMocks()

    const queuesMod = await import('../queues')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockQueueAdd = (queuesMod as any).__mockAdd

    mockJob = {
      id: TEST_JOB_ID,
      queueQualifiedName: TEST_QUEUE_NAME,
      data: { someData: 'value' },
      getChildrenValues: vi.fn().mockResolvedValue({
        'queue:child-1': { result: 'child1' },
        'queue:child-2': { result: 'child2' },
      }),
      updateData: vi.fn().mockResolvedValue(undefined),
      moveToWaitingChildren: vi.fn().mockResolvedValue(true),
    }

    mockQueueAdd.mockResolvedValue({ id: 'new-job-id' })
  })

  describe('create', () => {
    it('returns DynamicChildrenContext when token is provided', () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)
      expect(ctx).toBeInstanceOf(DynamicChildrenContext)
    })

    it('returns undefined when token is not provided', () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, undefined)
      expect(ctx).toBeUndefined()
    })

    it('returns undefined when token is empty string', () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, '')
      expect(ctx).toBeUndefined()
    })
  })

  describe('isResume', () => {
    it('returns false for initial invocation', () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!
      expect(ctx.isResume()).toBe(false)
    })

    it('returns true when resume flag is set', () => {
      mockJob.data = { __dynamicChildren_resumed: true }
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!
      expect(ctx.isResume()).toBe(true)
    })
  })

  describe('getChildrenResults', () => {
    it('returns children values from job', async () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!
      const results = await ctx.getChildrenResults()

      expect(mockJob.getChildrenValues).toHaveBeenCalled()
      expect(results).toEqual({
        'queue:child-1': { result: 'child1' },
        'queue:child-2': { result: 'child2' },
      })
    })
  })

  describe('addFlowStep', () => {
    it('adds a job with parent reference', async () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!

      await ctx.addFlowStep({
        name: 'childJob',
        queue: Queues.defaultQueue,
        data: { childData: 'test' },
      })

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'childJob',
        { childData: 'test' },
        {
          parent: {
            id: TEST_JOB_ID,
            queue: TEST_QUEUE_NAME,
          },
        },
      )
    })

    it('includes custom opts with parent reference', async () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!

      await ctx.addFlowStep({
        name: 'childJob',
        queue: Queues.defaultQueue,
        data: { childData: 'test' },
        opts: {
          jobId: 'custom-id',
          attempts: 3,
        },
      })

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'childJob',
        { childData: 'test' },
        {
          jobId: 'custom-id',
          attempts: 3,
          parent: {
            id: TEST_JOB_ID,
            queue: TEST_QUEUE_NAME,
          },
        },
      )
    })

    it('sets hasAddedSteps to true', async () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!

      expect(ctx.hasAddedSteps()).toBe(false)
      await ctx.addFlowStep({
        name: 'childJob',
        queue: Queues.defaultQueue,
        data: {},
      })
      expect(ctx.hasAddedSteps()).toBe(true)
    })
  })

  describe('addFlowSteps', () => {
    it('adds multiple jobs', async () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!

      await ctx.addFlowSteps([
        { name: 'child1', queue: Queues.defaultQueue, data: { idx: 1 } },
        { name: 'child2', queue: Queues.defaultQueue, data: { idx: 2 } },
        { name: 'child3', queue: Queues.defaultQueue, data: { idx: 3 } },
      ])

      expect(mockQueueAdd).toHaveBeenCalledTimes(3)
      expect(mockQueueAdd).toHaveBeenNthCalledWith(
        1,
        'child1',
        { idx: 1 },
        expect.objectContaining({
          parent: { id: TEST_JOB_ID, queue: TEST_QUEUE_NAME },
        }),
      )
      expect(mockQueueAdd).toHaveBeenNthCalledWith(
        2,
        'child2',
        { idx: 2 },
        expect.objectContaining({
          parent: { id: TEST_JOB_ID, queue: TEST_QUEUE_NAME },
        }),
      )
      expect(mockQueueAdd).toHaveBeenNthCalledWith(
        3,
        'child3',
        { idx: 3 },
        expect.objectContaining({
          parent: { id: TEST_JOB_ID, queue: TEST_QUEUE_NAME },
        }),
      )
    })
  })

  describe('waitForChildren', () => {
    it('does nothing when no steps were added', async () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!

      await ctx.waitForChildren()

      expect(mockJob.updateData).not.toHaveBeenCalled()
      expect(mockJob.moveToWaitingChildren).not.toHaveBeenCalled()
    })

    it('updates job data and throws WaitingChildrenError when steps were added', async () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!

      await ctx.addFlowStep({
        name: 'childJob',
        queue: Queues.defaultQueue,
        data: {},
      })

      await expect(ctx.waitForChildren()).rejects.toThrow(WaitingChildrenError)

      expect(mockJob.updateData).toHaveBeenCalledWith({
        someData: 'value',
        __dynamicChildren_resumed: true,
      })
      expect(mockJob.moveToWaitingChildren).toHaveBeenCalledWith(TEST_TOKEN)
    })

    it('does not throw when moveToWaitingChildren returns false', async () => {
      ;(
        mockJob.moveToWaitingChildren as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false)
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!

      await ctx.addFlowStep({
        name: 'childJob',
        queue: Queues.defaultQueue,
        data: {},
      })

      await expect(ctx.waitForChildren()).resolves.toBeUndefined()
    })
  })

  describe('jobId and jobData', () => {
    it('returns job id', () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!
      expect(ctx.jobId).toBe(TEST_JOB_ID)
    })

    it('returns job data', () => {
      const ctx = DynamicChildrenContext.create(mockJob as Job, TEST_TOKEN)!
      expect(ctx.jobData).toEqual({ someData: 'value' })
    })
  })
})
