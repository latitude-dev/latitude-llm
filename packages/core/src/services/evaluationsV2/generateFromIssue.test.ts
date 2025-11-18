import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as env from '@latitude-data/env'
import { Providers } from '@latitude-data/constants'
import {
  BadRequestError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../lib/errors'
import { Result } from '../../lib/Result'
import { CLOUD_MESSAGES } from '../../constants'
import * as copilotGet from '../copilot/get'
import * as copilotRun from '../copilot/run'
import * as createEvaluationV2Module from './create'
import * as findFirstModelForProviderModule from '../ai/providers/models'
import {
  IssuesRepository,
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
} from '../../repositories'
import {
  __test__,
  generateEvaluationFromIssueWithCopilot,
} from './generateFromIssue'
import * as factories from '../../tests/factories'
import type { Commit } from '../../schema/models/types/Commit'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Issue } from '../../schema/models/types/Issue'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { ProviderApiKey } from '../../schema/models/types/ProviderApiKey'

vi.mock('../../copilot/get', () => ({
  getCopilot: vi.fn(),
}))

vi.mock('../../copilot/run', () => ({
  runCopilot: vi.fn(),
}))

vi.mock('../../evaluationsV2/create', () => ({
  createEvaluationV2: vi.fn(),
}))

vi.mock('../../ai/providers/models', () => ({
  findFirstModelForProvider: vi.fn(),
}))

describe('generateEvaluationFromIssueWithCopilot', () => {
  const mockGetCopilot = vi.mocked(copilotGet.getCopilot)
  const mockRunCopilot = vi.mocked(copilotRun.runCopilot)
  const mockCreateEvaluationV2 = vi.mocked(
    createEvaluationV2Module.createEvaluationV2,
  )
  const mockFindFirstModelForProvider = vi.mocked(
    findFirstModelForProviderModule.findFirstModelForProvider,
  )

  let workspace: Workspace
  let commit: Commit
  let issue: Issue
  let document: DocumentVersion
  let provider: ProviderApiKey

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

    // Setup default mocks for services
    const mockEvaluation = {
      uuid: 'test-evaluation-uuid',
      versionId: 1,
      workspaceId: workspace.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: 'llm' as const,
      metric: 'binary' as const,
      configuration: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockCreateEvaluationV2.mockResolvedValue(
      Result.ok({
        evaluation: mockEvaluation,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )

    mockFindFirstModelForProvider.mockReturnValue('gpt-4o')

    // Setup default mocks for repositories
    vi.spyOn(IssuesRepository.prototype, 'find').mockResolvedValue(
      Result.ok(issue),
    )

    vi.spyOn(
      DocumentVersionsRepository.prototype,
      'getDocumentAtCommit',
    ).mockResolvedValue(Result.ok(document))

    vi.spyOn(
      ProviderApiKeysRepository.prototype,
      'findFirst',
    ).mockResolvedValue(Result.ok(provider))
  })

  it('successfully generates an evaluation from issue using copilot', async () => {
    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(true)
    const { evaluation } = result.value!
    expect(evaluation).toBeDefined()
    expect(evaluation.uuid).toBe('test-evaluation-uuid')
    expect(evaluation.versionId).toBe(1)

    // Verify repository calls
    expect(IssuesRepository.prototype.find).toHaveBeenCalledWith(issue.id)
    expect(
      DocumentVersionsRepository.prototype.getDocumentAtCommit,
    ).toHaveBeenCalledWith({
      commitUuid: commit.uuid,
      documentUuid: issue.documentUuid,
    })
    expect(ProviderApiKeysRepository.prototype.findFirst).toHaveBeenCalled()

    // Verify copilot calls
    expect(mockGetCopilot).toHaveBeenCalled()
    expect(mockRunCopilot).toHaveBeenCalledWith({
      copilot: expect.any(Object),
      parameters: {
        issueId: issue.id,
        issueDescription: issue.description,
        prompt: document.content,
      },
      schema: __test__.llmEvaluationBinarySpecificationWithoutModel,
    })

    // Verify evaluation creation
    expect(mockCreateEvaluationV2).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          configuration: expect.objectContaining({
            provider: provider.name,
            model: 'gpt-4o',
          }),
        }),
        issueId: issue.id,
        document,
        workspace,
        commit,
      }),
    )
  })

  it('returns error when LATITUDE_CLOUD is not enabled', async () => {
    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: false,
      COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH:
        '/copilot/evaluations/generator',
    } as typeof env.env)

    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot,
    )

    // Verify no repository or copilot calls were made
    expect(IssuesRepository.prototype.find).not.toHaveBeenCalled()
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set', async () => {
    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH: '',
    } as typeof env.env)

    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      'COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set',
    )

    // Verify no repository or copilot calls were made
    expect(IssuesRepository.prototype.find).not.toHaveBeenCalled()
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when issue is not found', async () => {
    vi.spyOn(IssuesRepository.prototype, 'find').mockResolvedValue(
      Result.error(new NotFoundError('Issue not found')),
    )

    await expect(
      generateEvaluationFromIssueWithCopilot({
        issueId: 999,
        workspace,
        commit,
      }),
    ).rejects.toThrow('Issue not found')

    // Verify issue repository was called but no further calls
    expect(IssuesRepository.prototype.find).toHaveBeenCalledWith(999)
    expect(
      DocumentVersionsRepository.prototype.getDocumentAtCommit,
    ).not.toHaveBeenCalled()
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when document is not found at commit', async () => {
    vi.spyOn(
      DocumentVersionsRepository.prototype,
      'getDocumentAtCommit',
    ).mockResolvedValue(Result.error(new NotFoundError('Document not found')))

    await expect(
      generateEvaluationFromIssueWithCopilot({
        issueId: issue.id,
        workspace,
        commit,
      }),
    ).rejects.toThrow('Document not found')

    // Verify document repository was called but no further calls
    expect(IssuesRepository.prototype.find).toHaveBeenCalled()
    expect(
      DocumentVersionsRepository.prototype.getDocumentAtCommit,
    ).toHaveBeenCalled()
    expect(ProviderApiKeysRepository.prototype.findFirst).not.toHaveBeenCalled()
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when provider is not found', async () => {
    vi.spyOn(
      ProviderApiKeysRepository.prototype,
      'findFirst',
    ).mockResolvedValue(Result.ok(undefined))

    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toBe('Provider not found')

    // Verify provider repository was called but no further calls
    expect(IssuesRepository.prototype.find).toHaveBeenCalled()
    expect(
      DocumentVersionsRepository.prototype.getDocumentAtCommit,
    ).toHaveBeenCalled()
    expect(ProviderApiKeysRepository.prototype.findFirst).toHaveBeenCalled()
    expect(mockFindFirstModelForProvider).not.toHaveBeenCalled()
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when model is not found', async () => {
    mockFindFirstModelForProvider.mockReturnValue(undefined)

    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toBe('Model not found')

    // Verify model lookup was called but no further calls
    expect(IssuesRepository.prototype.find).toHaveBeenCalled()
    expect(
      DocumentVersionsRepository.prototype.getDocumentAtCommit,
    ).toHaveBeenCalled()
    expect(ProviderApiKeysRepository.prototype.findFirst).toHaveBeenCalled()
    expect(mockFindFirstModelForProvider).toHaveBeenCalled()
    expect(mockGetCopilot).not.toHaveBeenCalled()
  })

  it('returns error when getCopilot fails', async () => {
    mockGetCopilot.mockResolvedValue(
      Result.error(new NotFoundError('Copilot not found')),
    )

    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toBe('Copilot not found')

    // Verify copilot was called but no further calls
    expect(mockGetCopilot).toHaveBeenCalled()
    expect(mockRunCopilot).not.toHaveBeenCalled()
    expect(mockCreateEvaluationV2).not.toHaveBeenCalled()
  })

  it('returns error when runCopilot fails', async () => {
    mockRunCopilot.mockResolvedValue(
      Result.error(new UnprocessableEntityError('Copilot execution failed')),
    )

    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(UnprocessableEntityError)
    expect(result.error?.message).toBe('Copilot execution failed')

    // Verify copilot run was called but evaluation creation was not
    expect(mockGetCopilot).toHaveBeenCalled()
    expect(mockRunCopilot).toHaveBeenCalled()
    expect(mockCreateEvaluationV2).not.toHaveBeenCalled()
  })

  it('returns error when createEvaluationV2 fails', async () => {
    mockCreateEvaluationV2.mockResolvedValue(
      Result.error(new BadRequestError('Evaluation creation failed')),
    )

    const result = await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('Evaluation creation failed')

    // Verify all steps were called
    expect(mockGetCopilot).toHaveBeenCalled()
    expect(mockRunCopilot).toHaveBeenCalled()
    expect(mockCreateEvaluationV2).toHaveBeenCalled()
  })

  it('passes correct parameters to runCopilot', async () => {
    await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(mockRunCopilot).toHaveBeenCalledWith({
      copilot: expect.anything(),
      parameters: {
        issueId: issue.id,
        issueDescription: issue.description,
        prompt: document.content,
      },
      schema: expect.anything(),
    })
  })

  it('includes provider and model in evaluation configuration', async () => {
    const testProvider = {
      ...provider,
      name: 'test-provider',
    }
    vi.spyOn(
      ProviderApiKeysRepository.prototype,
      'findFirst',
    ).mockResolvedValue(Result.ok(testProvider))
    mockFindFirstModelForProvider.mockReturnValue('test-model')

    await generateEvaluationFromIssueWithCopilot({
      issueId: issue.id,
      workspace,
      commit,
    })

    expect(mockCreateEvaluationV2).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          configuration: expect.objectContaining({
            provider: 'test-provider',
            model: 'test-model',
          }),
        }),
      }),
    )
  })
})
