import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as jobs from '../../'
import { LogSources, Providers } from '../../../browser'
import { Result } from '../../../lib/Result'
import * as queues from '../../../queues'
import * as commits from '../../../services/commits/runDocumentAtCommit'
import * as factories from '../../../tests/factories'
import { WebsocketClient } from '../../../websockets/workers'
import * as utils from '../../utils/progressTracker'
import { runDocumentForEvaluationJob } from './runDocumentJob'

const incrementErrorsMock = vi.hoisted(() => vi.fn())

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
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      documents: {
        'test-doc': factories.helpers.createPrompt({ provider: 'Latitude' }),
      },
    })
    workspace = setup.workspace
    project = setup.project
    document = setup.documents[0]
    commit = setup.commit

    evaluation = await factories.createLlmAsJudgeEvaluation({
      user: setup.user,
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

    // Set up spies
    vi.spyOn(WebsocketClient, 'getSocket').mockResolvedValue({
      emit: vi.fn(),
    } as any)

    vi.spyOn(jobs, 'setupJobs').mockResolvedValue({
      defaultQueue: {
        jobs: {
          enqueueRunEvaluationJob: vi.fn(),
        },
      },
      eventsQueue: {
        jobs: {
          enqueueCreateEventJob: vi.fn(),
          enqueuePublishEventJob: vi.fn(),
          enqueuePublishToAnalyticsJob: vi.fn(),
        },
      },
    } as any)

    vi.spyOn(queues, 'queues').mockResolvedValue({} as any)
    vi.spyOn(commits, 'runDocumentAtCommit')
    // @ts-ignore
    vi.spyOn(utils, 'ProgressTracker').mockImplementation(() => ({
      incrementCompleted: vi.fn(),
      incrementErrors: incrementErrorsMock,
      getProgress: vi.fn(),
    }))
  })

  it('should run document and enqueue evaluation job on success', async () => {
    const mockResult = {
      response: Promise.resolve('not undefined value'),
      documentLogUuid: 'log1',
    }
    vi.mocked(commits.runDocumentAtCommit).mockResolvedValue(
      // @ts-ignore
      Result.ok(mockResult),
    )

    await runDocumentForEvaluationJob(mockJob)

    expect(commits.runDocumentAtCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        commit,
        parameters: { param1: 'value1' },
        source: LogSources.Evaluation,
      }),
    )

    const setupJobsResult = await jobs.setupJobs()
    expect(
      setupJobsResult.defaultQueue.jobs.enqueueRunEvaluationJob,
    ).toHaveBeenCalledWith(
      {
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        documentLogUuid: 'log1',
        evaluationId: evaluation.id,
        batchId: 'batch1',
      },
      { lifo: true },
    )

    expect(incrementErrorsMock).not.toHaveBeenCalled()
  })

  it('should handle errors and update progress tracker', async () => {
    vi.mocked(commits.runDocumentAtCommit).mockRejectedValue(
      new Error('Test error'),
    )
    vi.mocked(env).NODE_ENV = 'production'

    await runDocumentForEvaluationJob(mockJob)

    const socket = await WebsocketClient.getSocket()
    expect(socket.emit).toHaveBeenCalledWith('evaluationStatus', {
      workspaceId: workspace.id,
      data: expect.objectContaining({
        batchId: 'batch1',
        evaluationId: evaluation.id,
        documentUuid: document.documentUuid,
      }),
    })

    expect(commits.runDocumentAtCommit).toHaveBeenCalled()
    const setupJobsResult = await jobs.setupJobs()
    expect(
      setupJobsResult.defaultQueue.jobs.enqueueRunEvaluationJob,
    ).not.toHaveBeenCalled()

    expect(incrementErrorsMock).toHaveBeenCalled()
  })

  it('should log errors in non-production environment', async () => {
    const testError = new Error('Test error')
    vi.mocked(commits.runDocumentAtCommit).mockRejectedValue(testError)
    vi.mocked(env).NODE_ENV = 'development'

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runDocumentForEvaluationJob(mockJob)

    expect(consoleSpy).toHaveBeenCalledWith(testError)
    expect(incrementErrorsMock).toHaveBeenCalled()

    const socket = await WebsocketClient.getSocket()
    expect(socket.emit).toHaveBeenCalledWith('evaluationStatus', {
      workspaceId: workspace.id,
      data: expect.objectContaining({
        batchId: 'batch1',
        evaluationId: evaluation.id,
        documentUuid: document.documentUuid,
      }),
    })
  })
})
