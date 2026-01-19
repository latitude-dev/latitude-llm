import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as env from '@latitude-data/env'
import { Providers } from '@latitude-data/constants'
import {
  BadRequestError,
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
import type {
  Workspace,
} from '@latitude-data/core/schema/models/types/Workspace'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import * as getSpanMessagesAndEvaluationResultsByIssue from '@latitude-data/core/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue'
import { Message, MessageRole } from '@latitude-data/constants/legacyCompiler'
import * as getSpanMessagesByIssueDocument from '../../../data-access/issues/getSpanMessagesByIssueDocument'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
  SpansRepository,
} from '../../../repositories'
import * as assembleModule from '../../tracing/traces/assemble'
import * as adaptModule from '../../tracing/spans/fetching/findCompletionSpanFromTrace'

vi.mock('../../copilot', () => ({
  runCopilot: vi.fn(),
}))

vi.mock(
  '@latitude-data/core/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue',
  () => ({
    getSpanMessagesAndEvaluationResultsByIssue: vi.fn(),
    getReasonFromEvaluationResult: vi.fn(() => ''),
  }),
)

vi.mock(
  '@latitude-data/core/data-access/issues/getSpanMessagesByIssueDocument',
  () => ({
    getSpanMessagesByIssueDocument: vi.fn(),
  }),
)

vi.mock('../../../repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../repositories')>()
  return {
    ...actual,
    SpansRepository: vi.fn(),
    CommitsRepository: vi.fn(),
    EvaluationResultsV2Repository: vi.fn(),
  }
})

vi.mock('../../tracing/traces/assemble', () => ({
  assembleTraceWithMessages: vi.fn(),
}))

vi.mock('../../tracing/spans/fetching/findCompletionSpanFromTrace', () => ({
  adaptCompletionSpanMessagesToLegacy: vi.fn(),
}))

const MODEL = 'gpt-4o'

describe('generateFromIssue', () => {
  const mockRunCopilot = vi.mocked(copilotModule.runCopilot)

  const mockGetSpanMessagesAndEvaluationResultsByIssue = vi.mocked(
    getSpanMessagesAndEvaluationResultsByIssue.getSpanMessagesAndEvaluationResultsByIssue,
  )

  const mockGetSpanMessagesByIssueDocument = vi.mocked(
    getSpanMessagesByIssueDocument.getSpanMessagesByIssueDocument,
  )

  const mockSpansRepositoryFindBySpanAndTraceIds = vi.fn()
  const mockCommitsRepositoryGetCommitsHistory = vi.fn()
  const mockEvaluationResultsV2RepositoryListBySpanAndEvaluations = vi.fn()
  const mockAssembleTraceWithMessages = vi.mocked(
    assembleModule.assembleTraceWithMessages,
  )
  const mockAdaptCompletionSpanMessagesToLegacy = vi.mocked(
    adaptModule.adaptCompletionSpanMessagesToLegacy,
  )

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

    mockGetSpanMessagesByIssueDocument.mockResolvedValue(
      Result.ok([{ messages, reason: '' }]),
    )

    mockSpansRepositoryFindBySpanAndTraceIds.mockResolvedValue(
      Result.ok([] as any),
    )
    vi.mocked(SpansRepository).mockImplementation(
      () =>
        ({
          findBySpanAndTraceIds: mockSpansRepositoryFindBySpanAndTraceIds,
        }) as unknown as SpansRepository,
    )

    mockCommitsRepositoryGetCommitsHistory.mockResolvedValue([commit])
    vi.mocked(CommitsRepository).mockImplementation(
      () =>
        ({
          getCommitsHistory: mockCommitsRepositoryGetCommitsHistory,
        }) as unknown as CommitsRepository,
    )

    mockEvaluationResultsV2RepositoryListBySpanAndEvaluations.mockResolvedValue(
      [],
    )
    vi.mocked(EvaluationResultsV2Repository).mockImplementation(
      () =>
        ({
          listBySpanAndEvaluations:
            mockEvaluationResultsV2RepositoryListBySpanAndEvaluations,
        }) as unknown as EvaluationResultsV2Repository,
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
    expect(mockRunCopilot).toHaveBeenCalledWith({
      path: '/copilot/evaluations/generator',
      parameters: {
        issueName: issue.title,
        issueDescription: issue.description,
        existingEvaluationNames: [],
        examplesWithIssue: [{ messages, reason: 'Test reason' }],
        goodExamplesWithoutIssue: [{ messages, reason: '' }],
        falsePositiveExamples: [],
        falseNegativeExamples: [],
        previousEvaluationConfiguration: undefined,
      },
      schema: __test__.llmEvaluationBinarySpecificationWithoutModel,
      db: expect.anything(),
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
    expect(mockRunCopilot).not.toHaveBeenCalled()
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
    expect(mockRunCopilot).not.toHaveBeenCalled()
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
    expect(mockRunCopilot).toHaveBeenCalled()
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
      path: '/copilot/evaluations/generator',
      parameters: {
        issueName: issue.title,
        issueDescription: issue.description,
        existingEvaluationNames: [],
        examplesWithIssue: [{ messages, reason: 'Test reason' }],
        goodExamplesWithoutIssue: [{ messages, reason: '' }],
        falsePositiveExamples: [],
        falseNegativeExamples: [],
        previousEvaluationConfiguration: undefined,
      },
      schema: expect.anything(),
      db: expect.anything(),
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

    mockSpansRepositoryFindBySpanAndTraceIds
      .mockResolvedValueOnce(
        Result.ok([{ id: 'span-1', traceId: 'trace-1' }] as any),
      )
      .mockResolvedValueOnce(
        Result.ok([{ id: 'span-2', traceId: 'trace-2' }] as any),
      )

    mockAssembleTraceWithMessages
      .mockResolvedValueOnce(
        Result.ok({
          trace: { messages: [] } as any,
          completionSpan: { metadata: {} } as any,
        }),
      )
      .mockResolvedValueOnce(
        Result.ok({
          trace: { messages: [] } as any,
          completionSpan: { metadata: {} } as any,
        }),
      )

    mockAdaptCompletionSpanMessagesToLegacy
      .mockReturnValueOnce(falsePositiveMessages)
      .mockReturnValueOnce(falseNegativeMessages)

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

    expect(mockRunCopilot).toHaveBeenCalledWith({
      path: '/copilot/evaluations/generator',
      parameters: {
        issueName: issue.title,
        issueDescription: issue.description,
        existingEvaluationNames: [],
        examplesWithIssue: [{ messages, reason: 'Test reason' }],
        goodExamplesWithoutIssue: [{ messages, reason: '' }],
        falsePositiveExamples: [
          { messages: falsePositiveMessages, reason: '' },
        ],
        falseNegativeExamples: [
          { messages: falseNegativeMessages, reason: '' },
        ],
        previousEvaluationConfiguration: previousConfig,
      },
      schema: __test__.llmEvaluationBinarySpecificationWithoutModel,
      db: expect.anything(),
    })
  })
})
