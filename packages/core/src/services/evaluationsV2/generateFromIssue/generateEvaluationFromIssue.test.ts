import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  Providers,
} from '@latitude-data/constants'
import { Result } from '@latitude-data/core/lib/Result'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '../../../tests/factories'
import * as updateActiveEvaluationModule from '../active/update'
import * as createEvaluationV2Module from '../create'
import * as createValidationFlowModule from './createEvaluationFlow'
import { generateEvaluationFromIssue } from './generateEvaluationFromIssue'
import * as generateFromIssueModule from './generateFromIssue'

vi.mock('./generateFromIssue', () => ({
  generateEvaluationConfigFromIssueWithCopilot: vi.fn(),
}))

vi.mock('./createEvaluationFlow', () => ({
  createValidationFlow: vi.fn(),
}))

vi.mock('../create', () => ({
  createEvaluationV2: vi.fn(),
}))

vi.mock('../active/update', () => ({
  updateActiveEvaluation: vi.fn(),
}))

describe('generateEvaluationFromIssue', () => {
  const mockGenerateEvaluationConfigFromIssueWithCopilot = vi.mocked(
    generateFromIssueModule.generateEvaluationConfigFromIssueWithCopilot,
  )
  const mockCreateEvaluationV2 = vi.mocked(
    createEvaluationV2Module.createEvaluationV2,
  )
  const mockUpdateActiveEvaluation = vi.mocked(
    updateActiveEvaluationModule.updateActiveEvaluation,
  )
  const mockCreateValidationFlow = vi.mocked(
    createValidationFlowModule.createValidationFlow,
  )

  let workspace: Workspace
  let commit: Commit
  let issue: Issue
  let document: DocumentVersion
  let provider: ProviderApiKey
  const TEST_WORKFLOW_UUID = 'test-workflow-uuid'
  const MODEL = 'gpt-4o'

  beforeEach(async () => {
    vi.clearAllMocks()

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
  })

  it('successfully generates evaluation and creates validation flow', async () => {
    const mockEvaluation = {
      uuid: 'test-evaluation-uuid',
      versionId: 1,
      workspaceId: workspace.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

    const mockValidationFlowJob = {
      id: 'test-validation-flow-job-id',
    } as Job

    mockGenerateEvaluationConfigFromIssueWithCopilot.mockResolvedValue(
      Result.ok({
        provider: provider.name,
        model: MODEL,
        actualOutput: {
          messageSelection: 'all',
          parsingFormat: 'string',
        },
        reverseScale: false,
        criteria: 'Test criteria',
        passDescription: 'Test pass description',
        failDescription: 'Test fail description',
        name: 'Test name',
        description: 'Test description',
        expectedOutput: {
          parsingFormat: 'string',
        },
      }),
    )
    mockCreateEvaluationV2.mockResolvedValue(
      Result.ok({ evaluation: mockEvaluation, target: undefined }),
    )
    mockUpdateActiveEvaluation.mockResolvedValue(
      Result.ok({
        workflowUuid: TEST_WORKFLOW_UUID,
        issueId: issue.id,
        queuedAt: new Date(),
        evaluationUuid: mockEvaluation.uuid,
      }),
    )
    mockCreateValidationFlow.mockResolvedValue(Result.ok(mockValidationFlowJob))

    const result = await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      workflowUuid: TEST_WORKFLOW_UUID,
      generationAttempt: 1,
    })

    expect(Result.isOk(result)).toBe(true)
    const validationFlowJob = result.unwrap()
    expect(validationFlowJob).toBe(mockValidationFlowJob)
    expect(validationFlowJob.id).toBe('test-validation-flow-job-id')

    // Verify generateEvaluationConfigFromIssueWithCopilot was called
    expect(
      mockGenerateEvaluationConfigFromIssueWithCopilot,
    ).toHaveBeenCalledWith({
      issue,
      commit,
      workspace,
      providerName: provider.name,
      model: MODEL,
      falsePositivesSpanAndTraceIdPairs: undefined,
      falseNegativesSpanAndTraceIdPairs: undefined,
      previousEvaluationConfiguration: undefined,
    })

    // Verify createEvaluationV2 was called with correct parameters
    expect(mockCreateEvaluationV2).toHaveBeenCalled()
    const createEvaluationV2Call = mockCreateEvaluationV2.mock.calls[0]![0]
    expect(createEvaluationV2Call.settings.name).toBe('Test name')
    expect(createEvaluationV2Call.settings.description).toBe('Test description')
    expect(createEvaluationV2Call.settings.type).toBe(EvaluationType.Llm)
    expect(createEvaluationV2Call.settings.metric).toBe(
      LlmEvaluationMetric.Binary,
    )
    // @ts-expect-error - configuration is a union type, but we know it has provider/model for LLM evaluations
    expect(createEvaluationV2Call.settings.configuration.provider).toBe(
      provider.name,
    )
    // @ts-expect-error - configuration is a union type, but we know it has provider/model for LLM evaluations
    expect(createEvaluationV2Call.settings.configuration.model).toBe(MODEL)
    expect(createEvaluationV2Call.issueId).toBe(issue.id)
    expect(createEvaluationV2Call.document.documentUuid).toBe(
      issue.documentUuid,
    )
    expect(createEvaluationV2Call.workspace).toBe(workspace)
    expect(createEvaluationV2Call.commit).toBe(commit)
    expect(mockCreateEvaluationV2.mock.calls[0]![1]).toBeDefined() // transaction parameter

    // Verify updateActiveEvaluation was called
    expect(mockUpdateActiveEvaluation).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      workflowUuid: TEST_WORKFLOW_UUID,
      evaluationUuid: mockEvaluation.uuid,
      evaluationName: mockEvaluation.name,
      targetUuid: undefined,
      targetAction: undefined,
    })

    // Verify createValidationFlow was called with correct parameters
    expect(mockCreateValidationFlow).toHaveBeenCalledWith(
      {
        workspace,
        commit,
        evaluationToEvaluate: mockEvaluation,
        issue,
        generationAttempt: 1,
        workflowUuid: TEST_WORKFLOW_UUID,
        providerName: provider.name,
        model: MODEL,
      },
      expect.any(Object), // transaction parameter
    )
  })

  it('returns error when generateEvaluationFromIssueWithCopilot fails', async () => {
    const error = new Error('Failed to generate evaluation')
    mockGenerateEvaluationConfigFromIssueWithCopilot.mockResolvedValue(
      Result.error(error),
    )

    const result = await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      workflowUuid: TEST_WORKFLOW_UUID,
      generationAttempt: 1,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBe(error)

    // Verify createValidationFlow was not called
    expect(mockCreateValidationFlow).not.toHaveBeenCalled()
  })

  it('returns error when createValidationFlow fails', async () => {
    const error = new Error('Failed to create validation flow')
    const mockEvaluation = {
      uuid: 'test-evaluation-uuid',
      versionId: 1,
      workspaceId: workspace.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

    mockGenerateEvaluationConfigFromIssueWithCopilot.mockResolvedValue(
      Result.ok({
        provider: provider.name,
        model: MODEL,
        actualOutput: {
          messageSelection: 'all',
          parsingFormat: 'string',
        },
        reverseScale: false,
        criteria: 'Test criteria',
        passDescription: 'Test pass description',
        failDescription: 'Test fail description',
        name: 'Test name',
        description: 'Test description',
        expectedOutput: {
          parsingFormat: 'string',
        },
      }),
    )
    mockCreateEvaluationV2.mockResolvedValue(
      Result.ok({ evaluation: mockEvaluation, target: undefined }),
    )
    mockUpdateActiveEvaluation.mockResolvedValue(
      Result.ok({
        workflowUuid: TEST_WORKFLOW_UUID,
        issueId: issue.id,
        queuedAt: new Date(),
        evaluationUuid: mockEvaluation.uuid,
      }),
    )
    mockCreateValidationFlow.mockResolvedValue(Result.error(error))

    const result = await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      workflowUuid: TEST_WORKFLOW_UUID,
      generationAttempt: 1,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBe(error)

    // Verify all functions were called
    expect(mockGenerateEvaluationConfigFromIssueWithCopilot).toHaveBeenCalled()
    expect(mockCreateEvaluationV2).toHaveBeenCalled()
    expect(mockUpdateActiveEvaluation).toHaveBeenCalled()
    expect(mockCreateValidationFlow).toHaveBeenCalled()
  })

  it('passes falsePositivesSpanAndTraceIdPairs, falseNegativesSpanAndTraceIdPairs, and previousEvaluationConfiguration to generateEvaluationConfigFromIssueWithCopilot', async () => {
    const falsePositives = [{ spanId: 'span-1', traceId: 'trace-1' }]
    const falseNegatives = [{ spanId: 'span-2', traceId: 'trace-2' }]
    const previousConfig = {
      criteria: 'test criteria',
      passDescription: 'test pass',
      failDescription: 'test fail',
    }

    const mockEvaluation = {
      uuid: 'test-evaluation-uuid',
      versionId: 1,
      workspaceId: workspace.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

    const mockValidationFlowJob = {
      id: 'test-validation-flow-job-id',
    } as Job

    mockGenerateEvaluationConfigFromIssueWithCopilot.mockResolvedValue(
      Result.ok({
        provider: provider.name,
        model: MODEL,
        actualOutput: {
          messageSelection: 'all',
          parsingFormat: 'string',
        },
        reverseScale: false,
        criteria: 'Test criteria',
        passDescription: 'Test pass description',
        failDescription: 'Test fail description',
        name: 'Test name',
        description: 'Test description',
        expectedOutput: {
          parsingFormat: 'string',
        },
      }),
    )
    mockCreateEvaluationV2.mockResolvedValue(
      Result.ok({ evaluation: mockEvaluation, target: undefined }),
    )
    mockUpdateActiveEvaluation.mockResolvedValue(
      Result.ok({
        workflowUuid: TEST_WORKFLOW_UUID,
        issueId: issue.id,
        queuedAt: new Date(),
        evaluationUuid: mockEvaluation.uuid,
      }),
    )
    mockCreateValidationFlow.mockResolvedValue(Result.ok(mockValidationFlowJob))

    await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      workflowUuid: TEST_WORKFLOW_UUID,
      generationAttempt: 1,
      falsePositivesSpanAndTraceIdPairs: falsePositives,
      falseNegativesSpanAndTraceIdPairs: falseNegatives,
      previousEvaluationConfiguration: previousConfig,
    })

    expect(
      mockGenerateEvaluationConfigFromIssueWithCopilot,
    ).toHaveBeenCalledWith({
      issue,
      commit,
      workspace,
      providerName: provider.name,
      model: MODEL,
      falsePositivesSpanAndTraceIdPairs: falsePositives,
      falseNegativesSpanAndTraceIdPairs: falseNegatives,
      previousEvaluationConfiguration: previousConfig,
    })
  })
})
