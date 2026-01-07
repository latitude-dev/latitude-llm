import { OptimizationEngine, Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { EvaluationType, RuleEvaluationMetric } from '../../constants'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { Commit } from '../../schema/models/types/Commit'
import { Dataset } from '../../schema/models/types/Dataset'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Optimization } from '../../schema/models/types/Optimization'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { executeOptimization } from './execute'
import * as optimizersModule from './optimizers'

const mocks = vi.hoisted(() => ({
  optimizationsQueue: vi.fn(),
}))

vi.mock('../../jobs/queues', () => ({
  queues: vi.fn().mockResolvedValue({
    optimizationsQueue: {
      add: mocks.optimizationsQueue,
    },
  }),
}))

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('executeOptimization', () => {
  let publisherMock: MockInstance
  let optimizerMock: MockInstance

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

    optimizerMock = vi
      .spyOn(optimizersModule.OPTIMIZATION_ENGINES, OptimizationEngine.Identity)
      .mockResolvedValue(Result.ok(document.content))
  })

  it('fails when optimization is already executed', async () => {
    const executedOptimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
      optimized: {
        commit,
        prompt: 'optimized prompt',
      },
    })

    const optimizationWithExecuted = {
      ...executedOptimization,
      executedAt: new Date(),
      validatedAt: null,
      finishedAt: null,
    } as Optimization

    await expect(
      executeOptimization({
        optimization: optimizationWithExecuted,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already executed'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
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
      executeOptimization({
        optimization: finishedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already ended'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when trainset is not set', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
    })

    await expect(
      executeOptimization({
        optimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot execute an optimization without a trainset',
      ),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when optimizer produces invalid prompt', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const preparedOptimization = {
      ...optimization,
      preparedAt: new Date(),
    } as Optimization

    optimizerMock.mockResolvedValue(Result.ok('---\ninvalid: yaml: :'))

    await expect(
      executeOptimization({
        optimization: preparedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimized prompt has errors'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('executes optimization successfully', async () => {
    const evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.RegularExpression,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        pattern: '.*',
      },
    })

    const optimization = await factories.createOptimization({
      baseline: { commit },
      evaluation,
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const preparedOptimization = {
      ...optimization,
      preparedAt: new Date(),
    } as Optimization

    const result = await executeOptimization({
      optimization: preparedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.executedAt).not.toBeNull()
    expect(result.optimization.optimizedCommitId).not.toBeNull()
    expect(result.optimization.optimizedPrompt).toBe(document.content)
    expect(result.optimized.commit).toBeDefined()
    expect(result.optimized.prompt).toBe(document.content)

    expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
    expect(mocks.optimizationsQueue).toHaveBeenCalledWith(
      'validateOptimizationJob',
      {
        workspaceId: workspace.id,
        optimizationId: result.optimization.id,
      },
      expect.objectContaining({
        jobId: expect.stringContaining('validateOptimizationJob'),
        attempts: 1,
        deduplication: expect.any(Object),
      }),
    )

    expect(publisherMock).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledWith({
      type: 'optimizationExecuted',
      data: {
        workspaceId: workspace.id,
        optimizationId: result.optimization.id,
      },
    })
  })

  it('creates an optimized commit with correct title', async () => {
    const evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.RegularExpression,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        pattern: '.*',
      },
    })

    const optimization = await factories.createOptimization({
      baseline: { commit },
      evaluation,
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const preparedOptimization = {
      ...optimization,
      preparedAt: new Date(),
    } as Optimization

    const result = await executeOptimization({
      optimization: preparedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimized.commit.title).toContain('Optimized')
    expect(result.optimized.commit.title).toContain(
      optimization.uuid.slice(0, 8),
    )
  })

  it('calls the optimizer with correct arguments', async () => {
    const evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.RegularExpression,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        pattern: '.*',
      },
    })

    const optimization = await factories.createOptimization({
      baseline: { commit },
      evaluation,
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const preparedOptimization = {
      ...optimization,
      preparedAt: new Date(),
    } as Optimization

    await executeOptimization({
      optimization: preparedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(optimizerMock).toHaveBeenCalledTimes(1)
    expect(optimizerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluate: expect.any(Function),
        evaluation: expect.objectContaining({ uuid: evaluation.uuid }),
        dataset: expect.objectContaining({ id: trainset.id }),
        optimization: expect.objectContaining({ id: optimization.id }),
        workspace: expect.objectContaining({ id: workspace.id }),
      }),
    )
  })
})
