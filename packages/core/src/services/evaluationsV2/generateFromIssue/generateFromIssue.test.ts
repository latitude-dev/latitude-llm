import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as env from '@latitude-data/env'
import { Providers } from '@latitude-data/constants'
import {
  BadRequestError,
  NotFoundError,
  UnprocessableEntityError,
} from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { CLOUD_MESSAGES } from '../../../constants'
import * as copilotModule from '../../copilot'
import {
  __test__,
  generateEvaluationConfigFromIssueWithCopilot,
} from './generateFromIssue'
import * as factories from '../../../tests/factories'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import * as getSpanMessagesAndEvaluationResultsByIssue from '@latitude-data/core/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue'
import { Message, MessageRole } from '@latitude-data/constants/legacyCompiler'
import * as getSpanMessagesByIssueDocument from '../../../data-access/issues/getSpanMessagesByIssueDocument'
import * as getSpanMessagesBySpans from '../../../data-access/issues/getSpanMessagesBySpans'
import { SpansRepository } from '../../../repositories'

vi.mock('../../copilot', () => ({
  getCopilot: vi.fn(),
  runCopilot: vi.fn(),
}))

vi.mock(
  '@latitude-data/core/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue',
  () => ({
    getSpanMessagesAndEvaluationResultsByIssue: vi.fn(),
  }),
)

vi.mock(
  '@latitude-data/core/data-access/issues/getSpanMessagesByIssueDocument',
  () => ({
    getSpanMessagesByIssueDocument: vi.fn(),
  }),
)

vi.mock('../../../data-access/issues/getSpanMessagesBySpans', () => ({
  getSpanMessagesBySpans: vi.fn(),
}))

vi.mock('../../../repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../repositories')>()
  return {
    ...actual,
    SpansRepository: vi.fn(),
  }
})

const MODEL = 'gpt-4o'

describe('generateFromIssue', () => {
  const mockGetCopilot = vi.mocked(copilotModule.getCopilot)
  const mockRunCopilot = vi.mocked(copilotModule.runCopilot)

  const mockGetSpanMessagesAndEvaluationResultsByIssue = vi.mocked(
    getSpanMessagesAndEvaluationResultsByIssue.getSpanMessagesAndEvaluationResultsByIssue,
  )

  const mockGetSpanMessagesByIssueDocument = vi.mocked(
    getSpanMessagesByIssueDocument.getSpanMessagesByIssueDocument,
  )

  const mockGetSpanMessagesBySpans = vi.mocked(
    getSpanMessagesBySpans.getSpanMessagesBySpans,
  )

  const mockSpansRepositoryFindBySpanAndTraceIds = vi.fn()

  let workspace: Workspace
  let commit: Commit
  let issue: Issue
  let document: DocumentVersion
  let provider: ProviderApiKey
  let messages: Message[]

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()

    // Setup test data using factories
    const projectData = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Test prompt content',
        }),
        model: MODEL,
      },
    })
    workspace = projectData.workspace
    commit = projectData.commit
    document = projectData.documents[0]!
    provider = projectData.providers[0]!

    const issueData = await factories.createIssue({
      document,
      workspace,
    })
    issue = issueData.issue

    // Setup env spy with default values
    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH:
        '/copilot/evaluations/generator',
      COPILOT_WORKSPACE_API_KEY: 'test-workspace-api-key',
      COPILOT_PROJECT_ID: 1,
      NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: 'openai',
    } as typeof env.env)

    // Setup default mocks for copilot functions
    const mockCopilot = {
      workspace: {} as Workspace,
      commit: {} as Commit,
      document: {} as DocumentVersion,
    }
    mockGetCopilot.mockResolvedValue(Result.ok(mockCopilot))

    mockRunCopilot.mockResolvedValue(
      Result.ok({
        instructions: 'Test evaluation instructions',
        criteria: 'Test criteria',
      }),
    )

    messages = [
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'Test question' }],
      },
      {
        role: MessageRole.assistant,
        content: [{ type: 'text', text: 'Test answer' }],
        toolCalls: [],
      },
    ] as Message[]

    mockGetSpanMessagesAndEvaluationResultsByIssue.mockResolvedValue(
      Result.ok([{ messages, reason: 'Test reason' }]),
    )

    mockGetSpanMessagesByIssueDocument.mockResolvedValue(Result.ok(messages))

    mockSpansRepositoryFindBySpanAndTraceIds.mockResolvedValue(
      Result.ok([] as any),
    )
    vi.mocked(SpansRepository).mockImplementation(
      () =>
        ({
          findBySpanAndTraceIds: mockSpansRepositoryFindBySpanAndTraceIds,
        }) as unknown as SpansRepository,
    )
  })

  it('successfully generates an evaluation from issue using copilot', async () => {
    const result = await generateEvaluationConfigFromIssueWithCopilot({
      issue: issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
    })

    expect(Result.isOk(result)).toBe(true)
    const evaluation = result.unwrap()
    expect(evaluation).toBeDefined()

    // Verify copilot calls
    expect(mockGetCopilot).toHaveBeenCalled()
    expect(mockRunCopilot).toHaveBeenCalledWith({
      copilot: expect.any(Object),
      parameters: {
        issueName: issue.title,
        issueDescription: issue.description,
        existingEvaluationNames: [],
        examplesWithIssueAndReasonWhy: [{ messages, reason: 'Test reason' }],
        goodExamplesWithoutIssue: messages,
        falsePositiveExamples: [],
        falseNegativeExamples: [],
        previousEvaluationConfiguration: undefined,
      },
      schema: __test__.llmEvaluationBinarySpecificationWithoutModel,
    })
  })

  it('returns error when LATITUDE_CLOUD is not enabled', async () => {
    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: false,
      COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH:
        '/copilot/evaluations/generator',
    } as typeof env.env)

    const result = await generateEvaluationConfigFromIssueWithCopilot({
      issue: issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot,
    )

    // Verify no repository or copilot calls were made
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set', async () => {
    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH: '',
    } as typeof env.env)

    const result = await generateEvaluationConfigFromIssueWithCopilot({
      issue: issue,
      providerName: provider.name,
      model: MODEL,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      'COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set',
    )

    // Verify no repository or copilot calls were made
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when document is not found at commit', async () => {
    const result = await generateEvaluationConfigFromIssueWithCopilot({
      issue,
      providerName: provider.name,
      model: MODEL,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(true)
    expect(mockGetCopilot).toHaveBeenCalled()
  })

  it('returns error when getCopilot fails', async () => {
    mockGetCopilot.mockResolvedValue(
      Result.error(new NotFoundError('Copilot not found')),
    )

    const result = await generateEvaluationConfigFromIssueWithCopilot({
      issue,
      providerName: provider.name,
      model: MODEL,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toBe('Copilot not found')

    // Verify copilot was called but no further calls
    expect(mockGetCopilot).toHaveBeenCalled()
    expect(mockRunCopilot).not.toHaveBeenCalled()
  })

  it('returns error when runCopilot fails', async () => {
    mockRunCopilot.mockResolvedValue(
      Result.error(new UnprocessableEntityError('Copilot execution failed')),
    )

    const result = await generateEvaluationConfigFromIssueWithCopilot({
      issue,
      providerName: provider.name,
      model: MODEL,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(UnprocessableEntityError)
    expect(result.error?.message).toBe('Copilot execution failed')

    // Verify copilot run was called but evaluation creation was not
    expect(mockGetCopilot).toHaveBeenCalled()
    expect(mockRunCopilot).toHaveBeenCalled()
  })

  it('passes correct parameters to runCopilot', async () => {
    await generateEvaluationConfigFromIssueWithCopilot({
      issue,
      providerName: provider.name,
      model: MODEL,
      workspace,
      commit,
    })

    expect(mockRunCopilot).toHaveBeenCalledWith({
      copilot: expect.anything(),
      parameters: {
        issueName: issue.title,
        issueDescription: issue.description,
        existingEvaluationNames: [],
        examplesWithIssueAndReasonWhy: [{ messages, reason: 'Test reason' }],
        goodExamplesWithoutIssue: messages,
        falsePositiveExamples: [],
        falseNegativeExamples: [],
        previousEvaluationConfiguration: undefined,
      },
      schema: expect.anything(),
    })
  })

  it('passes falsePositivesSpanAndTraceIdPairs, falseNegativesSpanAndTraceIdPairs, and previousEvaluationConfiguration to copilot', async () => {
    const falsePositives = [{ spanId: 'span-1', traceId: 'trace-1' }]
    const falseNegatives = [{ spanId: 'span-2', traceId: 'trace-2' }]
    const previousConfig = {
      criteria: 'test criteria',
      passDescription: 'test pass',
      failDescription: 'test fail',
    }

    const falsePositiveMessages = [
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'False positive message' }],
      },
    ] as Message[]
    const falseNegativeMessages = [
      {
        role: MessageRole.assistant,
        content: [{ type: 'text', text: 'False negative message' }],
        toolCalls: [],
      },
    ] as Message[]

    mockGetSpanMessagesBySpans
      .mockResolvedValueOnce(Result.ok(falsePositiveMessages))
      .mockResolvedValueOnce(Result.ok(falseNegativeMessages))

    const result = await generateEvaluationConfigFromIssueWithCopilot({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      falsePositivesSpanAndTraceIdPairs: falsePositives,
      falseNegativesSpanAndTraceIdPairs: falseNegatives,
      previousEvaluationConfiguration: previousConfig,
    })

    expect(Result.isOk(result)).toBe(true)
    expect(mockSpansRepositoryFindBySpanAndTraceIds).toHaveBeenCalledTimes(2)
    expect(mockGetSpanMessagesBySpans).toHaveBeenCalledTimes(2)

    expect(mockRunCopilot).toHaveBeenCalledWith({
      copilot: expect.any(Object),
      parameters: {
        issueName: issue.title,
        issueDescription: issue.description,
        existingEvaluationNames: [],
        examplesWithIssueAndReasonWhy: [{ messages, reason: 'Test reason' }],
        goodExamplesWithoutIssue: messages,
        falsePositiveExamples: falsePositiveMessages,
        falseNegativeExamples: falseNegativeMessages,
        previousEvaluationConfiguration: previousConfig,
      },
      schema: __test__.llmEvaluationBinarySpecificationWithoutModel,
    })
  })
})
