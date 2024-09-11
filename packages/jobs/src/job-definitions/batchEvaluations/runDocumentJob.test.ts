import { LogSources } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
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
    eventsQueue: {
      jobs: {
        enqueueCreateEventJob: vi.fn(),
        enqueuePublishEventJob: vi.fn(),
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
  let mockJob: Job
  let workspace: any
  let project: any
  let document: any
  let commit: any
  let evaluation: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create necessary resources using factories
    const setup = await factories.createProject({
      documents: { 'test-doc': 'Test content' },
    })
    workspace = setup.workspace
    project = setup.project
    document = setup.documents[0]
    commit = setup.commit

    evaluation = await factories.createLlmAsJudgeEvaluation({
      workspace,
      name: 'Test Evaluation',
    })

    mockJob = {
      data: {
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        parameters: { param1: 'value1' },
        evaluationId: evaluation.id,
        batchId: 'batch1',
      },
    } as Job<any>
  })

  it('should run document and enqueue evaluation job on success', async () => {
    const mockResult = {
      response: Promise.resolve(),
      documentLogUuid: 'log1',
    }
    // @ts-ignore
    vi.mocked(runDocumentAtCommit).mockResolvedValue(Result.ok(mockResult))

    await runDocumentJob(mockJob)

    expect(runDocumentAtCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.id,
        commit,
        parameters: { param1: 'value1' },
        source: LogSources.Evaluation,
      }),
    )

    expect(
      mocks.queues.defaultQueue.jobs.enqueueRunEvaluationJob,
    ).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      documentLogUuid: 'log1',
      evaluationId: evaluation.id,
      batchId: 'batch1',
    })

    expect(ProgressTracker.prototype.incrementErrors).not.toHaveBeenCalled()
    expect(ProgressTracker.prototype.decrementTotal).not.toHaveBeenCalled()
  })

  it('should handle errors and update progress tracker', async () => {
    vi.mocked(runDocumentAtCommit).mockRejectedValue(new Error('Test error'))
    vi.mocked(env).NODE_ENV = 'production'

    await runDocumentJob(mockJob)

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

    await runDocumentJob(mockJob)

    expect(consoleSpy).toHaveBeenCalledWith(testError)
    expect(ProgressTracker.prototype.incrementErrors).toHaveBeenCalled()
    expect(ProgressTracker.prototype.decrementTotal).toHaveBeenCalled()
  })
})
