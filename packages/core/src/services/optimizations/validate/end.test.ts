import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { publisher } from '../../../events/publisher'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Commit } from '../../../schema/models/types/Commit'
import { Dataset } from '../../../schema/models/types/Dataset'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Optimization } from '../../../schema/models/types/Optimization'
import { Project } from '../../../schema/models/types/Project'
import { User } from '../../../schema/models/types/User'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { endValidateOptimization } from './end'

vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('endValidateOptimization', () => {
  let publisherMock: MockInstance

  let workspace: WorkspaceDto
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let trainset: Dataset
  let testset: Dataset

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

    trainset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)
    testset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)

    publisherMock = vi.mocked(publisher.publishLater)
  })

  it('fails when optimization is already validated', async () => {
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

    const validatedOptimization = await factories.createOptimization({
      baseline: { commit, experiment: baselineExperiment },
      document,
      project,
      workspace,
      trainset,
      testset,
      optimized: {
        commit: commit,
        prompt: 'optimized prompt',
        experiment: optimizedExperiment,
      },
    })

    const optimizationWithValidated = {
      ...validatedOptimization,
      validatedAt: new Date(),
      finishedAt: null,
    } as Optimization

    await expect(
      endValidateOptimization({
        optimization: optimizationWithValidated,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already validated'),
    )

    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when optimization is already finished', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const finishedOptimization = {
      ...optimization,
      finishedAt: new Date(),
    } as Optimization

    await expect(
      endValidateOptimization({
        optimization: finishedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already ended'),
    )

    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('ends validation successfully', async () => {
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

    const executedOptimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
      optimized: {
        commit: commit,
        prompt: 'optimized prompt',
      },
    })

    const optimizationWithExperiments = {
      ...executedOptimization,
      baselineExperimentId: baselineExperiment.id,
      optimizedExperimentId: optimizedExperiment.id,
    } as Optimization

    const result = await endValidateOptimization({
      optimization: optimizationWithExperiments,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.validatedAt).not.toBeNull()
    expect(result.optimization.finishedAt).not.toBeNull()
  })

  it('publishes optimizationValidated and optimizationEnded events', async () => {
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

    const executedOptimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
      optimized: {
        commit: commit,
        prompt: 'optimized prompt',
      },
    })

    const optimizationWithExperiments = {
      ...executedOptimization,
      baselineExperimentId: baselineExperiment.id,
      optimizedExperimentId: optimizedExperiment.id,
    } as Optimization

    await endValidateOptimization({
      optimization: optimizationWithExperiments,
      workspace,
    }).then((r) => r.unwrap())

    expect(publisherMock).toHaveBeenCalledTimes(2)
    expect(publisherMock).toHaveBeenNthCalledWith(1, {
      type: 'optimizationValidated',
      data: {
        workspaceId: workspace.id,
        optimizationId: optimizationWithExperiments.id,
      },
    })
    expect(publisherMock).toHaveBeenNthCalledWith(2, {
      type: 'optimizationEnded',
      data: {
        workspaceId: workspace.id,
        optimizationId: optimizationWithExperiments.id,
      },
    })
  })

  it('updates timestamps correctly', async () => {
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

    const executedOptimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
      optimized: {
        commit: commit,
        prompt: 'optimized prompt',
      },
    })

    const optimizationWithExperiments = {
      ...executedOptimization,
      baselineExperimentId: baselineExperiment.id,
      optimizedExperimentId: optimizedExperiment.id,
    } as Optimization

    const beforeEnd = new Date()

    const result = await endValidateOptimization({
      optimization: optimizationWithExperiments,
      workspace,
    }).then((r) => r.unwrap())

    const afterEnd = new Date()

    expect(result.optimization.validatedAt).not.toBeNull()
    expect(result.optimization.validatedAt!.getTime()).toBeGreaterThanOrEqual(
      beforeEnd.getTime(),
    )
    expect(result.optimization.validatedAt!.getTime()).toBeLessThanOrEqual(
      afterEnd.getTime(),
    )
    expect(result.optimization.finishedAt).not.toBeNull()
    expect(result.optimization.finishedAt!.getTime()).toBeGreaterThanOrEqual(
      beforeEnd.getTime(),
    )
    expect(result.optimization.finishedAt!.getTime()).toBeLessThanOrEqual(
      afterEnd.getTime(),
    )
  })
})
