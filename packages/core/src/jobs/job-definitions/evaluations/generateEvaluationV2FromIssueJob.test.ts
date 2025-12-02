import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '@latitude-data/core/lib/Result'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE } from '@latitude-data/constants/issues'
import { Providers, ActiveEvaluation } from '@latitude-data/constants'
import * as factories from '../../../tests/factories'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import {
  generateEvaluationV2FromIssueJob,
  type GenerateEvaluationV2FromIssueJobData,
} from './generateEvaluationV2FromIssueJob'
import * as generateEvaluationFromIssueModule from '../../../services/evaluationsV2/generateFromIssue/generateEvaluationFromIssue'
import * as startActiveEvaluationModule from '../../../services/evaluationsV2/active/start'
import * as endActiveEvaluationModule from '../../../services/evaluationsV2/active/end'
import * as failActiveEvaluationModule from '../../../services/evaluationsV2/active/fail'
import { captureException } from '../../../utils/datadogCapture'
import * as unsafelyFindWorkspaceModule from '../../../data-access/workspaces'
import { CommitsRepository, IssuesRepository } from '../../../repositories'

// Mock dependencies
vi.mock(
  '../../../services/evaluationsV2/generateFromIssue/generateEvaluationFromIssue',
  () => ({
    generateEvaluationFromIssue: vi.fn(),
  }),
)

vi.mock('../../../services/evaluationsV2/active/start', () => ({
  startActiveEvaluation: vi.fn(),
}))

vi.mock('../../../services/evaluationsV2/active/end', () => ({
  endActiveEvaluation: vi.fn(),
}))

vi.mock('../../../services/evaluationsV2/active/fail', () => ({
  failActiveEvaluation: vi.fn(),
}))

vi.mock('../../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

vi.mock('../../../data-access/workspaces', () => ({
  unsafelyFindWorkspace: vi.fn(),
}))

vi.mock('../../../repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../repositories')>()
  return {
    ...actual,
    CommitsRepository: vi.fn(),
    IssuesRepository: vi.fn(),
  }
})

describe('generateEvaluationV2FromIssueJob', () => {
  const mockGenerateEvaluationFromIssue = vi.mocked(
    generateEvaluationFromIssueModule.generateEvaluationFromIssue,
  )
  const mockStartActiveEvaluation = vi.mocked(
    startActiveEvaluationModule.startActiveEvaluation,
  )
  const mockEndActiveEvaluation = vi.mocked(
    endActiveEvaluationModule.endActiveEvaluation,
  )
  const mockFailActiveEvaluation = vi.mocked(
    failActiveEvaluationModule.failActiveEvaluation,
  )
  const mockUnsafelyFindWorkspace = vi.mocked(
    unsafelyFindWorkspaceModule.unsafelyFindWorkspace,
  )
  const mockCommitsRepositoryGetCommitById = vi.fn()
  const mockIssuesRepositoryFind = vi.fn()

  let workspace: WorkspaceDto
  let commit: Commit
  let issue: Issue
  let jobData: Job<GenerateEvaluationV2FromIssueJobData>
  const WORKFLOW_UUID = 'test-workflow-uuid'
  const MODEL = 'gpt-4o'

  function buildJobData(
    overrides: Partial<GenerateEvaluationV2FromIssueJobData> = {},
  ): GenerateEvaluationV2FromIssueJobData {
    return {
      workspaceId: workspace.id,
      commitId: commit.id,
      issueId: issue.id,
      providerName: 'openai',
      model: MODEL,
      workflowUuid: WORKFLOW_UUID,
      generationAttempt: 1,
      ...overrides,
    }
  }

  function createMockJob(
    data: GenerateEvaluationV2FromIssueJobData,
    attemptsMade = 0,
  ): Job<GenerateEvaluationV2FromIssueJobData> {
    return {
      id: 'test-job-id',
      data,
      attemptsMade,
      opts: {
        attempts: MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE,
      },
    } as unknown as Job<GenerateEvaluationV2FromIssueJobData>
  }

  beforeEach(async () => {
    vi.clearAllMocks()

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
    workspace = projectData.workspace as WorkspaceDto
    commit = projectData.commit

    const issueData = await factories.createIssue({
      document: projectData.documents[0]!,
      workspace,
    })
    issue = issueData.issue

    mockUnsafelyFindWorkspace.mockResolvedValue(workspace)
    mockCommitsRepositoryGetCommitById.mockResolvedValue(Result.ok(commit))
    vi.mocked(CommitsRepository).mockImplementation(
      () =>
        ({
          getCommitById: mockCommitsRepositoryGetCommitById,
        }) as unknown as CommitsRepository,
    )
    mockIssuesRepositoryFind.mockResolvedValue(Result.ok(issue))
    vi.mocked(IssuesRepository).mockImplementation(
      () =>
        ({
          find: mockIssuesRepositoryFind,
        }) as unknown as IssuesRepository,
    )

    const mockValidationFlowJob = {
      id: 'test-validation-flow-job-id',
    } as Job
    mockGenerateEvaluationFromIssue.mockResolvedValue(
      Result.ok(mockValidationFlowJob),
    )
    mockStartActiveEvaluation.mockResolvedValue(
      Result.ok({
        workflowUuid: WORKFLOW_UUID,
        issueId: issue.id,
        queuedAt: new Date(),
      } as ActiveEvaluation),
    )
    mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))
    mockFailActiveEvaluation.mockResolvedValue(
      Result.ok({
        workflowUuid: WORKFLOW_UUID,
        issueId: issue.id,
        queuedAt: new Date(),
      } as ActiveEvaluation),
    )
  })

  describe('Case 1: Job succeeds on first attempt (generationAttempt == 1)', () => {
    beforeEach(() => {
      jobData = createMockJob(buildJobData({ generationAttempt: 1 }))
    })

    it('should call startActiveEvaluation and generateEvaluationFromIssue', async () => {
      await generateEvaluationV2FromIssueJob(jobData)

      expect(mockStartActiveEvaluation).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        workflowUuid: WORKFLOW_UUID,
      })
      expect(mockGenerateEvaluationFromIssue).toHaveBeenCalled()
      const callArgs = mockGenerateEvaluationFromIssue.mock.calls[0]![0]
      expect(callArgs.issue.id).toBe(issue.id)
      expect(callArgs.workspace.id).toBe(workspace.id)
      expect(callArgs.commit.id).toBe(commit.id)
      expect(callArgs.providerName).toBe('openai')
      expect(callArgs.model).toBe(MODEL)
      expect(callArgs.workflowUuid).toBe(WORKFLOW_UUID)
      expect(callArgs.generationAttempt).toBe(1)
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
    })
  })

  describe('Case 2: Job succeeds on subsequent attempt (generationAttempt > 1)', () => {
    beforeEach(() => {
      jobData = createMockJob(
        buildJobData({ generationAttempt: 2 }),
        MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE - 1, // Not last attempt
      )
    })

    it('should NOT call startActiveEvaluation but should call generateEvaluationFromIssue', async () => {
      await generateEvaluationV2FromIssueJob(jobData)

      expect(mockStartActiveEvaluation).not.toHaveBeenCalled()
      expect(mockGenerateEvaluationFromIssue).toHaveBeenCalled()
      const callArgs = mockGenerateEvaluationFromIssue.mock.calls[0]![0]
      expect(callArgs.issue.id).toBe(issue.id)
      expect(callArgs.workspace.id).toBe(workspace.id)
      expect(callArgs.commit.id).toBe(commit.id)
      expect(callArgs.providerName).toBe('openai')
      expect(callArgs.model).toBe(MODEL)
      expect(callArgs.workflowUuid).toBe(WORKFLOW_UUID)
      expect(callArgs.generationAttempt).toBe(2)
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
    })
  })

  describe('Case 3: Fail before last attempt', () => {
    beforeEach(() => {
      jobData = createMockJob(
        buildJobData({
          generationAttempt: MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE - 1,
        }),
        MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE - 1, // Not last attempt
      )
      mockGenerateEvaluationFromIssue.mockResolvedValue(
        Result.error(new Error('Test error')),
      )
    })

    it('should throw error but not fail or end active evaluation', async () => {
      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Test error',
      )

      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
    })
  })

  describe('Case 4: Fail on last attempt', () => {
    beforeEach(() => {
      jobData = createMockJob(
        buildJobData({
          generationAttempt: MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE,
        }),
        MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE, // Last attempt
      )
      mockGenerateEvaluationFromIssue.mockResolvedValue(
        Result.error(new Error('Last attempt failed')),
      )
      mockFailActiveEvaluation.mockResolvedValue(
        Result.ok({
          workflowUuid: WORKFLOW_UUID,
          issueId: issue.id,
          queuedAt: new Date(),
        } as ActiveEvaluation),
      )
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))
    })

    it('should fail and end active evaluation on last attempt', async () => {
      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Last attempt failed',
      )

      expect(mockFailActiveEvaluation).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        workflowUuid: WORKFLOW_UUID,
        error: expect.any(Error),
      })
      expect(mockEndActiveEvaluation).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        workflowUuid: WORKFLOW_UUID,
      })
      expect(captureException).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should capture exception if failActiveEvaluation fails', async () => {
      mockFailActiveEvaluation.mockResolvedValue(
        Result.error(new Error('Fail active eval failed')),
      )

      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Last attempt failed',
      )

      expect(captureException).toHaveBeenCalledWith(expect.any(Error)) // Original error
      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            '[GenerateEvaluationV2FromIssueJob] Failed to fail active evaluation',
        }),
      )
    })

    it('should capture exception if endActiveEvaluation fails', async () => {
      mockEndActiveEvaluation.mockResolvedValue(
        Result.error(new Error('End active eval failed')),
      )

      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Last attempt failed',
      )

      expect(captureException).toHaveBeenCalledWith(expect.any(Error)) // Original error
      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            '[GenerateEvaluationV2FromIssueJob] Failed to end active evaluation',
        }),
      )
    })
  })

  describe('Case 5: Max attempts exceeded', () => {
    beforeEach(() => {
      jobData = createMockJob(
        buildJobData({
          generationAttempt: MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE + 1,
        }),
      )
    })

    it('should throw error before calling generateEvaluationFromIssue', async () => {
      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Max attempts to generate evaluation from issue reached',
      )

      expect(mockGenerateEvaluationFromIssue).not.toHaveBeenCalled()
      expect(mockStartActiveEvaluation).not.toHaveBeenCalled()
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('should throw error if workspace not found', async () => {
      mockUnsafelyFindWorkspace.mockResolvedValue(
        undefined as unknown as WorkspaceDto,
      )
      jobData = createMockJob(buildJobData({ workspaceId: 999 }))

      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Workspace not found 999',
      )
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
    })

    it('should throw error if commit not found', async () => {
      mockCommitsRepositoryGetCommitById.mockResolvedValue(
        Result.error(new NotFoundError('Commit not found')),
      )
      jobData = createMockJob(buildJobData({ commitId: 999 }))

      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
    })

    it('should throw error if issue not found', async () => {
      mockIssuesRepositoryFind.mockResolvedValue(
        Result.error(new NotFoundError('Issue not found')),
      )
      jobData = createMockJob(buildJobData({ issueId: 999 }))

      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
    })

    it('should throw error if generateEvaluationFromIssue fails', async () => {
      jobData = createMockJob(buildJobData({ generationAttempt: 1 }))
      mockGenerateEvaluationFromIssue.mockResolvedValue(
        Result.error(new Error('Evaluation generation failed')),
      )

      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Evaluation generation failed',
      )
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('should handle generationAttempt exactly at MAX_ATTEMPTS', async () => {
      jobData = createMockJob(
        buildJobData({
          generationAttempt: MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE,
        }),
      )

      await generateEvaluationV2FromIssueJob(jobData)

      expect(mockGenerateEvaluationFromIssue).toHaveBeenCalled()
      expect(mockStartActiveEvaluation).not.toHaveBeenCalled() // generationAttempt > 1
    })

    it('should handle generationAttempt just above MAX_ATTEMPTS', async () => {
      jobData = createMockJob(
        buildJobData({
          generationAttempt: MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE + 1,
        }),
      )

      await expect(generateEvaluationV2FromIssueJob(jobData)).rejects.toThrow(
        'Max attempts to generate evaluation from issue reached',
      )
    })
  })
})
