import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../constants'
import { BadRequestError } from '../../lib/errors'
import {
  Commit,
  DocumentVersion,
  ProviderApiKey,
  Workspace,
} from '../../schema/types'
import * as factories from '../../tests/factories'
import { cloneEvaluationV2 } from './clone'
import { LlmEvaluationRatingSpecification, buildPrompt } from './llm/rating'

describe('cloneEvaluationV2', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let provider: ProviderApiKey
  let evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Rating>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      documents,
      commit: c,
      providers,
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
    commit = c
    document = documents[0]!
    provider = providers[0]!

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Rating,
      name: 'evaluation',
      description: 'description',
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        provider: provider.name,
        model: 'gpt-4o',
        criteria: 'criteria',
        minRating: 1,
        minRatingDescription: 'min description',
        maxRating: 5,
        maxRatingDescription: 'max description',
        minThreshold: 3,
      },
    })

    await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      name: 'evaluation (1)',
    })
  })

  it('fails when cloning is not supported for the evaluation', async () => {
    const otherEvaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      name: 'other evaluation',
    })

    await expect(
      cloneEvaluationV2({
        evaluation: otherEvaluation,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Cloning is not supported for this evaluation'),
    )
  })

  it('fails when type and metric cloning fails', async () => {
    vi.spyOn(LlmEvaluationRatingSpecification, 'clone').mockRejectedValue(
      new BadRequestError('metric cloning error'),
    )

    await expect(
      cloneEvaluationV2({
        evaluation: evaluation,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('metric cloning error'))
  })

  it('succeeds when cloning an evaluation', async () => {
    const { evaluation: clonedEvaluation } = await cloneEvaluationV2({
      evaluation: evaluation,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(clonedEvaluation).toEqual(
      expect.objectContaining({
        name: `${evaluation.name} (2)`,
        description: evaluation.description,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Custom,
        configuration: {
          reverseScale: evaluation.configuration.reverseScale,
          actualOutput: evaluation.configuration.actualOutput,
          expectedOutput: evaluation.configuration.expectedOutput,
          provider: evaluation.configuration.provider,
          model: evaluation.configuration.model,
          prompt: expect.stringContaining(
            buildPrompt({ ...evaluation.configuration, provider }),
          ),
          minScore: evaluation.configuration.minRating,
          maxScore: evaluation.configuration.maxRating,
          minThreshold: evaluation.configuration.minThreshold,
          maxThreshold: evaluation.configuration.maxThreshold,
        },
      }),
    )
  })
})
