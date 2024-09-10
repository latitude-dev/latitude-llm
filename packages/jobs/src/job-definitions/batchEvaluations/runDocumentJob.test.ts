import { LogSources } from '@latitude-data/core/browser'
import { Result } from '@latitude-data/core/lib/Result'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProgressTracker } from '../../utils/progressTracker'
import { runDocumentJob } from './runDocumentJob'

const mocks = vi.hoisted(() => ({
  queues: {
    defaultQueue: {
      jobs: {
        enqueueRunEvaluationJob: vi.fn(),
      },
    },
  },
}))

// Mock dependencies
vi.mock('../../', () => ({
  setupJobs: vi.fn().mockImplementation(() => mocks.queues),
}))

vi.mock('@latitude-data/core/redis')
vi.mock('@latitude-data/core/services/commits/runDocumentAtCommit')
vi.mock('@latitude-data/env')
vi.mock('../../utils/progressTracker')

describe('runDocumentJob', () => {
  const mockJob = {
    data: {
      workspaceId: 1,
      document: { id: 'doc1' },
      commit: { id: 'commit1' },
      parameters: { param1: 'value1' },
      evaluationId: 123,
      batchId: 'batch1',
    },
  } as Job<any>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should run document and enqueue evaluation job on success', async () => {
    const mockResult = {
      response: Promise.resolve(),
      documentLogUuid: 'log1',
    }
    // @ts-ignore
    vi.mocked(runDocumentAtCommit).mockResolvedValue(Result.ok(mockResult))

    await runDocumentJob.handler(mockJob)

    expect(runDocumentAtCommit).toHaveBeenCalledWith({
      workspaceId: 1,
      document: { id: 'doc1' },
      commit: { id: 'commit1' },
      parameters: { param1: 'value1' },
      source: LogSources.Evaluation,
    })

    expect(
      mocks.queues.defaultQueue.jobs.enqueueRunEvaluationJob,
    ).toHaveBeenCalledWith({
      documentLogUuid: 'log1',
      evaluationId: 123,
      batchId: 'batch1',
    })

    expect(ProgressTracker.prototype.incrementErrors).not.toHaveBeenCalled()
    expect(ProgressTracker.prototype.decrementTotal).not.toHaveBeenCalled()
  })

  it('should handle errors and update progress tracker', async () => {
    vi.mocked(runDocumentAtCommit).mockRejectedValue(new Error('Test error'))
    vi.mocked(env).NODE_ENV = 'production'

    await runDocumentJob.handler(mockJob)

    expect(runDocumentAtCommit).toHaveBeenCalled()
    expect(
      mocks.queues.defaultQueue.jobs.enqueueRunEvaluationJob,
    ).not.toHaveBeenCalled()

    expect(ProgressTracker.prototype.incrementErrors).toHaveBeenCalled()
    expect(ProgressTracker.prototype.decrementTotal).toHaveBeenCalled()
  })

  it('should log errors in non-production environment', async () => {
    const testError = new Error('Test error')
    vi.mocked(runDocumentAtCommit).mockRejectedValue(testError)
    vi.mocked(env).NODE_ENV = 'development'

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runDocumentJob.handler(mockJob)

    expect(consoleSpy).toHaveBeenCalledWith(testError)
    expect(ProgressTracker.prototype.incrementErrors).toHaveBeenCalled()
    expect(ProgressTracker.prototype.decrementTotal).toHaveBeenCalled()
  })
})
