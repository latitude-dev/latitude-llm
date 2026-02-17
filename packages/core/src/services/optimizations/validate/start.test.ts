import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { EvaluationType, RuleEvaluationMetric } from '../../../constants'
import { AbortedError, UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { Commit } from '../../../schema/models/types/Commit'
import { Dataset } from '../../../schema/models/types/Dataset'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Optimization } from '../../../schema/models/types/Optimization'
import { Project } from '../../../schema/models/types/Project'
import { User } from '../../../schema/models/types/User'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import * as startExperimentModule from '../../experiments/start'
import { startValidateOptimization } from './start'

vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('startValidateOptimization', () => {
  let startExperimentMock: MockInstance

  let workspace: WorkspaceDto
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let trainset: Dataset
  let testset: Dataset
  let optimizedCommit: Commit

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

    optimizedCommit = await factories
      .createDraft({
        project,
        user,
      })
      .then((r) => r.commit)

    startExperimentMock = vi
      .spyOn(startExperimentModule, 'startExperiment')
      .mockImplementation(async (args) => {
        return Result.ok({ uuid: args.experimentUuid } as any)
      })
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
        commit: optimizedCommit,
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
      startValidateOptimization({
        optimization: optimizationWithValidated,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already validated'),
    )
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
      startValidateOptimization({
        optimization: finishedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already ended'),
    )
  })

  it('fails when testset is not set', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
    })

    await expect(
      startValidateOptimization({
        optimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot validate an optimization without a testset',
      ),
    )
  })

  it('fails when optimized commit is not set', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    await expect(
      startValidateOptimization({
        optimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot validate an optimization without an optimized commit',
      ),
    )
  })

  it('fails when optimized prompt is not set', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
      optimized: {
        commit: optimizedCommit,
      },
    })

    await expect(
      startValidateOptimization({
        optimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot validate an optimization without an optimized prompt',
      ),
    )
  })

  it('starts validation successfully and creates experiments', async () => {
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
      optimized: {
        commit: optimizedCommit,
        prompt: document.content,
      },
    })

    const executedOptimization = {
      ...optimization,
      executedAt: new Date(),
    } as Optimization

    const result = await startValidateOptimization({
      optimization: executedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.baselineExperimentId).not.toBeNull()
    expect(result.optimization.optimizedExperimentId).not.toBeNull()
    expect(result.experiments.baseline).toBeDefined()
    expect(result.experiments.optimized).toBeDefined()

    expect(startExperimentMock).toHaveBeenCalledTimes(2)
  })

  it('creates experiments with correct names', async () => {
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
      optimized: {
        commit: optimizedCommit,
        prompt: document.content,
      },
    })

    const executedOptimization = {
      ...optimization,
      executedAt: new Date(),
    } as Optimization

    const result = await startValidateOptimization({
      optimization: executedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.baselineExperimentId).not.toBeNull()
    expect(result.optimization.optimizedExperimentId).not.toBeNull()
  })

  describe('cancellation', () => {
    it('throws AbortedError when signal is already aborted', async () => {
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
        optimized: {
          commit: optimizedCommit,
          prompt: document.content,
        },
      })

      const executedOptimization = {
        ...optimization,
        executedAt: new Date(),
      } as Optimization

      const abortController = new AbortController()
      abortController.abort()

      await expect(
        startValidateOptimization({
          optimization: executedOptimization,
          workspace,
          abortSignal: abortController.signal,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError(AbortedError)

      expect(startExperimentMock).not.toHaveBeenCalled()
    })

    it('starts both experiments even when signal is aborted during first start', async () => {
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
        optimized: {
          commit: optimizedCommit,
          prompt: document.content,
        },
      })

      const executedOptimization = {
        ...optimization,
        executedAt: new Date(),
      } as Optimization

      const abortController = new AbortController()

      startExperimentMock.mockImplementation(async (args: any) => {
        abortController.abort()
        return Result.ok({ uuid: args.experimentUuid } as any)
      })

      const result = await startValidateOptimization({
        optimization: executedOptimization,
        workspace,
        abortSignal: abortController.signal,
      }).then((r) => r.unwrap())

      expect(result.optimization).toBeDefined()
      expect(startExperimentMock).toHaveBeenCalledTimes(2)
    })
  })
})
