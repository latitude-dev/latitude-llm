import { Providers } from '@latitude-data/constants'
import { OPTIMIZATION_CANCELLED_ERROR } from '@latitude-data/constants/optimizations'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Optimization } from '../../schema/models/types/Optimization'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { cancelOptimization } from './cancel'

const mocks = vi.hoisted(() => ({
  optimizationsQueue: {
    add: vi.fn(),
    getJob: vi.fn(),
  },
}))

vi.mock('../../jobs/queues', () => ({
  queues: vi.fn().mockResolvedValue({
    optimizationsQueue: mocks.optimizationsQueue,
  }),
}))

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
    publish: vi.fn(),
  },
}))

vi.mock('../../redis', () => ({
  buildRedisConnection: vi.fn().mockResolvedValue({}),
  REDIS_KEY_PREFIX: 'test:',
}))

describe('cancelOptimization', () => {
  let publisherMock: MockInstance

  let workspace: WorkspaceDto
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let optimization: Optimization

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      commit: c,
      documents,
      user: u,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = w
    project = p
    commit = c
    document = documents[0]!
    user = u

    optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
    })

    mocks.optimizationsQueue.getJob.mockResolvedValue(null)
    publisherMock = vi.mocked(publisher.publishLater)
  })

  it('fails when optimization is already finished', async () => {
    const { experiment: baselineExperiment } = await factories.createExperiment(
      {
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      },
    )
    const { experiment: optimizedExperiment } =
      await factories.createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

    const finishedOptimization = await factories.createOptimization({
      baseline: { commit, experiment: baselineExperiment },
      document,
      project,
      workspace,
      trainset: await factories
        .createDataset({ workspace, author: user })
        .then((r) => r.dataset),
      testset: await factories
        .createDataset({ workspace, author: user })
        .then((r) => r.dataset),
      optimized: {
        commit: commit,
        prompt: 'optimized prompt',
        experiment: optimizedExperiment,
      },
    })

    await expect(
      cancelOptimization({
        optimization: finishedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already ended'),
    )

    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('cancels optimization that has not been prepared yet', async () => {
    const result = await cancelOptimization({
      optimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.finishedAt).not.toBeNull()
    expect(result.optimization.error).toBe(OPTIMIZATION_CANCELLED_ERROR)

    expect(publisherMock).toHaveBeenCalledWith({
      type: 'optimizationEnded',
      data: {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      },
    })
  })

  it('cancels optimization that has been prepared but not executed', async () => {
    const trainset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)
    const testset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)

    const preparedOptimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const result = await cancelOptimization({
      optimization: preparedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.finishedAt).not.toBeNull()
    expect(result.optimization.error).toBe(OPTIMIZATION_CANCELLED_ERROR)

    expect(publisherMock).toHaveBeenCalledWith({
      type: 'optimizationEnded',
      data: {
        workspaceId: workspace.id,
        optimizationId: preparedOptimization.id,
      },
    })
  })

  it('attempts to stop the prepare job when not prepared', async () => {
    const mockJob = {
      id: `${optimization.uuid}-prepareOptimizationJob`,
      getState: vi.fn().mockResolvedValue('waiting'),
      waitUntilFinished: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    }

    mocks.optimizationsQueue.getJob.mockResolvedValue(mockJob)

    await cancelOptimization({
      optimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(mocks.optimizationsQueue.getJob).toHaveBeenCalledWith(
      `${optimization.uuid}-prepareOptimizationJob`,
    )
    expect(publisher.publish).toHaveBeenCalledWith('cancelJob', {
      jobId: mockJob.id,
    })
  })

  it('attempts to stop the execute job when prepared but not executed', async () => {
    const trainset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)
    const testset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)

    const preparedOptimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const mockJob = {
      id: `${preparedOptimization.uuid}-executeOptimizationJob`,
      getState: vi.fn().mockResolvedValue('waiting'),
      waitUntilFinished: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    }

    mocks.optimizationsQueue.getJob.mockResolvedValue(mockJob)

    await cancelOptimization({
      optimization: preparedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(mocks.optimizationsQueue.getJob).toHaveBeenCalledWith(
      `${preparedOptimization.uuid}-executeOptimizationJob`,
    )
    expect(publisher.publish).toHaveBeenCalledWith('cancelJob', {
      jobId: mockJob.id,
    })
  })

  it('sets the correct error message when cancelled', async () => {
    const result = await cancelOptimization({
      optimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.error).toBe(OPTIMIZATION_CANCELLED_ERROR)
  })

  it('publishes optimizationEnded event when cancelled', async () => {
    await cancelOptimization({
      optimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(publisherMock).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledWith({
      type: 'optimizationEnded',
      data: {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      },
    })
  })
})
