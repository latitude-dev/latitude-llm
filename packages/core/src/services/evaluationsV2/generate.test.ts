import { Providers } from '@latitude-data/constants'
import * as env from '@latitude-data/env'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { ZodObject } from 'zod'
import * as cache from '../../cache'
import {
  EvaluationSettings,
  EvaluationType,
  LlmEvaluationMetric,
} from '../../constants'
import { Result } from '../../lib/Result'
import { UnprocessableEntityError } from '../../lib/errors'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import * as copilot from '../copilot'
import * as providerApiKeys from '../providerApiKeys/findDefaultProvider'
import { generateEvaluationV2 } from './generate'

describe('generateEvaluationV2', () => {
  let mocks: {
    cacheGet: MockInstance
    cacheSet: MockInstance
    runCopilot: MockInstance
  }

  let workspace: WorkspaceDto
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
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
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

    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenCalledExactlyOnceWith({
      path: expect.any(String),
      parameters: {
        instructions: '',
        prompt: document.content,
      },
      schema: expect.any(ZodObject),
      db: expect.anything(),
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
    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenCalledExactlyOnceWith({
      path: expect.any(String),
      parameters: {
        instructions: 'instructions',
        prompt: document.content,
      },
      schema: expect.any(ZodObject),
      db: expect.anything(),
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
    expect(mocks.cacheGet).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.cacheSet).not.toHaveBeenCalled()
  })
})
