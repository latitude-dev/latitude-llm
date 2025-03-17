import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as jobs from '../../'
import { LogSources, Providers } from '../../../browser'
import { Result } from '../../../lib/Result'
import * as queues from '../../../queues'
import * as commits from '../../../services/commits/runDocumentAtCommit'
import * as factories from '../../../tests/factories'
import { mockToolRequestsCopilot } from '../../../tests/helpers'
import { WebsocketClient } from '../../../websockets/workers'
import * as utils from '../../utils/progressTracker'

const incrementErrorsMock = vi.hoisted(() => vi.fn())

describe('runDocumentJob', () => {
  let mockJob: Job
  let workspace: any
  let project: any
  let document: any
  let commit: any
  let evaluation: any

  beforeAll(async () => {
    await mockToolRequestsCopilot()
  })

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

    vi.spyOn(jobs, 'setupQueues').mockResolvedValue({
      evaluationsQueue: {
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

    vi.spyOn(queues, 'queuesConnection').mockResolvedValue({} as any)
    vi.spyOn(commits, 'runDocumentAtCommit')
    // @ts-ignore
    vi.spyOn(utils, 'ProgressTracker').mockImplementation(() => ({
      incrementCompleted: vi.fn(),
      incrementErrors: incrementErrorsMock,
      getProgress: vi.fn(),
    }))
  })

  it('should run document and enqueue evaluation job on success', async () => {
    const mod = await import('./runDocumentJob')
    const runDocumentForEvaluationJob = mod.runDocumentForEvaluationJob
    const mockResult = {
      errorableUuid: 'log1',
      lastResponse: Promise.resolve({ providerLog: { uuid: 'log1' } }),
      toolCalls: Promise.resolve([]),
      messages: Promise.resolve([]),
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

    const setupQueuesResult = await jobs.setupQueues()
    expect(
      setupQueuesResult.defaultQueue.jobs.enqueueRunEvaluationJob,
    ).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      providerLogUuid: 'log1',
      evaluationId: evaluation.id,
      batchId: 'batch1',
    })

    expect(incrementErrorsMock).not.toHaveBeenCalled()
  })

  it('should handle errors and update progress tracker', async () => {
    const mod = await import('./runDocumentJob')
    const runDocumentForEvaluationJob = mod.runDocumentForEvaluationJob

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
        version: 'v1',
      }),
    })

    expect(commits.runDocumentAtCommit).toHaveBeenCalled()
    const setupQueuesResult = await jobs.setupQueues()
    expect(
      setupQueuesResult.evaluationsQueue.jobs.enqueueRunEvaluationJob,
    ).not.toHaveBeenCalled()

    expect(incrementErrorsMock).toHaveBeenCalled()
  })

  it('should log errors in non-production environment', async () => {
    const mod = await import('./runDocumentJob')
    const runDocumentForEvaluationJob = mod.runDocumentForEvaluationJob
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
        version: 'v1',
      }),
    })
  })
})
