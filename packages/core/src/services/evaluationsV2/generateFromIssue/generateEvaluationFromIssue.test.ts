import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Result } from '@latitude-data/core/lib/Result'
import { generateEvaluationFromIssue } from './generateEvaluationFromIssue'
import * as generateFromIssueModule from './generateFromIssue'
import * as createValidationFlowModule from './createEvaluationFlow'
import * as factories from '../../../tests/factories'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import {
  Providers,
  EvaluationType,
  LlmEvaluationMetric,
  EvaluationV2,
} from '@latitude-data/constants'
import type { Job } from 'bullmq'

vi.mock('./generateFromIssue', () => ({
  generateEvaluationFromIssueWithCopilot: vi.fn(),
}))

vi.mock('./createEvaluationFlow', () => ({
  createValidationFlow: vi.fn(),
}))

describe('generateEvaluationFromIssue', () => {
  const mockGenerateEvaluationFromIssueWithCopilot = vi.mocked(
    generateFromIssueModule.generateEvaluationFromIssueWithCopilot,
  )
  const mockCreateValidationFlow = vi.mocked(
    createValidationFlowModule.createValidationFlow,
  )

  let workspace: Workspace
  let commit: Commit
  let issue: Issue
  let document: DocumentVersion
  let provider: ProviderApiKey
  const TEST_EVALUATION_UUID = 'test-evaluation-uuid'
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
      uuid: TEST_EVALUATION_UUID,
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

    mockGenerateEvaluationFromIssueWithCopilot.mockResolvedValue(
      Result.ok({ evaluation: mockEvaluation }),
    )
    mockCreateValidationFlow.mockResolvedValue(Result.ok(mockValidationFlowJob))

    const result = await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      evaluationUuid: TEST_EVALUATION_UUID,
    })

    expect(Result.isOk(result)).toBe(true)
    const { validationFlowJob } = result.unwrap()
    expect(validationFlowJob).toBe(mockValidationFlowJob)
    expect(validationFlowJob.id).toBe('test-validation-flow-job-id')

    // Verify generateEvaluationFromIssueWithCopilot was called
    expect(mockGenerateEvaluationFromIssueWithCopilot).toHaveBeenCalledWith({
      issue,
      commit,
      workspace,
      providerName: provider.name,
      model: MODEL,
      evaluationUuid: TEST_EVALUATION_UUID,
    })

    // Verify createValidationFlow was called with correct parameters
    expect(mockCreateValidationFlow).toHaveBeenCalledWith({
      workspace,
      commit,
      evaluationToEvaluate: mockEvaluation,
      documentUuid: issue.documentUuid,
      issue,
    })
  })

  it('returns error when generateEvaluationFromIssueWithCopilot fails', async () => {
    const error = new Error('Failed to generate evaluation')
    mockGenerateEvaluationFromIssueWithCopilot.mockResolvedValue(
      Result.error(error),
    )

    const result = await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      evaluationUuid: TEST_EVALUATION_UUID,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBe(error)

    // Verify createValidationFlow was not called
    expect(mockCreateValidationFlow).not.toHaveBeenCalled()
  })

  it('returns error when createValidationFlow fails', async () => {
    const mockEvaluation = {
      uuid: TEST_EVALUATION_UUID,
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

    const error = new Error('Failed to create validation flow')
    mockGenerateEvaluationFromIssueWithCopilot.mockResolvedValue(
      Result.ok({ evaluation: mockEvaluation }),
    )
    mockCreateValidationFlow.mockResolvedValue(Result.error(error))

    const result = await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName: provider.name,
      model: MODEL,
      evaluationUuid: TEST_EVALUATION_UUID,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error).toBe(error)

    // Verify both functions were called
    expect(mockGenerateEvaluationFromIssueWithCopilot).toHaveBeenCalled()
    expect(mockCreateValidationFlow).toHaveBeenCalled()
  })
})
