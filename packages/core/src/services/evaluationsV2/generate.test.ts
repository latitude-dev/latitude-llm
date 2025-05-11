import * as env from '@latitude-data/env'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { ZodObject } from 'zod'
import {
  Commit,
  DocumentVersion,
  EvaluationSettings,
  EvaluationType,
  LlmEvaluationMetric,
  Providers,
  Workspace,
} from '../../browser'
import * as cache from '../../cache'
import { Result } from '../../lib/Result'
import { UnprocessableEntityError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import * as copilot from '../copilot'
import * as providerApiKeys from '../providerApiKeys/findDefaultProvider'
import { generateEvaluationV2 } from './generate'

describe('generateEvaluationV2', () => {
  let mocks: {
    cacheGet: MockInstance
    cacheSet: MockInstance
    getCopilot: MockInstance
    runCopilot: MockInstance
  }

  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let settings: EvaluationSettings<
    EvaluationType.Llm,
    LlmEvaluationMetric.Rating
  >

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      documents,
      commit: c,
    } = await factories.createProject({
      providers: [
        { type: Providers.OpenAI, name: 'openai', defaultModel: 'gpt-4o' },
      ],
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

    settings = {
      name: 'name',
      description: 'description',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Rating,
      configuration: {
        reverseScale: false,
        provider: 'openai',
        model: 'gpt-4o',
        criteria: 'criteria',
        minRating: 1,
        minRatingDescription: 'min description',
        maxRating: 5,
        maxRatingDescription: 'max description',
        minThreshold: 3,
      },
    }

    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_REFINE_PROMPT_PATH: 'refiner',
    })

    const mockCacheGet = vi.fn().mockResolvedValue(null)
    const mockCacheSet = vi.fn()
    vi.spyOn(cache, 'cache').mockReturnValue(
      Promise.resolve({
        get: mockCacheGet,
        set: mockCacheSet,
      } as any),
    )
    mocks = {
      cacheGet: mockCacheGet,
      cacheSet: mockCacheSet,
      getCopilot: vi
        .spyOn(copilot, 'getCopilot')
        .mockImplementation(async (_) => {
          return Result.ok({ workspace, commit, document })
        }),
      runCopilot: vi
        .spyOn(copilot, 'runCopilot')
        .mockImplementation(async (_) => {
          return Result.ok({
            name: settings.name,
            description: settings.description,
            reverseScale: settings.configuration.reverseScale,
            criteria: settings.configuration.criteria,
            minRatingDescription: settings.configuration.minRatingDescription,
            maxRatingDescription: settings.configuration.maxRatingDescription,
          })
        }),
    }
  })

  it('fails when no provider is available', async () => {
    vi.spyOn(
      providerApiKeys,
      'findDefaultEvaluationProvider',
    ).mockResolvedValue(Result.nil())

    await expect(
      generateEvaluationV2({
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('No provider for evaluations available'),
    )

    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.cacheSet).not.toHaveBeenCalled()
  })

  it('fails when no model is available', async () => {
    vi.spyOn(
      providerApiKeys,
      'findDefaultEvaluationProvider',
    ).mockResolvedValue(
      Result.ok({
        provider: Providers.Custom,
        defaultModel: undefined,
      } as any),
    )

    await expect(
      generateEvaluationV2({
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('No model for evaluations available'),
    )

    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.cacheSet).not.toHaveBeenCalled()
  })

  it('fails when copilot fails', async () => {
    mocks.runCopilot.mockImplementation(async (_) => {
      return Result.error(new UnprocessableEntityError('copilot error'))
    })

    await expect(
      generateEvaluationV2({
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new UnprocessableEntityError('copilot error'))

    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenCalledExactlyOnceWith({
      copilot: expect.any(Object),
      parameters: {
        instructions: '',
        prompt: document.content,
      },
      schema: expect.any(ZodObject),
    })
    expect(mocks.cacheSet).not.toHaveBeenCalled()
  })

  it('succeeds when generating an evaluation not cached', async () => {
    const { settings: generatedSettings } = await generateEvaluationV2({
      instructions: 'instructions',
      document: document,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(generatedSettings).toEqual(settings)
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenCalledExactlyOnceWith({
      copilot: expect.any(Object),
      parameters: {
        instructions: 'instructions',
        prompt: document.content,
      },
      schema: expect.any(ZodObject),
    })
    expect(mocks.cacheSet).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      JSON.stringify(settings),
    )
  })

  it('succeeds when generating an evaluation cached', async () => {
    mocks.cacheGet.mockResolvedValue(JSON.stringify(settings))

    const { settings: generatedSettings } = await generateEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(generatedSettings).toEqual(settings)
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.cacheSet).not.toHaveBeenCalled()
  })
})
