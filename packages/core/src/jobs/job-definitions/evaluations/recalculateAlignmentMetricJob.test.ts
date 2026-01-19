import { Providers } from '@latitude-data/constants'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../../constants'
import * as unsafelyFindWorkspaceModule from '../../../data-access/workspaces'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import { NotFoundError } from '../../../lib/errors'
import {
  CommitsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'
import type { Commit } from '../../../schema/models/types/Commit'
import type { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import type { WorkspaceDto } from '../../../schema/models/types/Workspace'
import * as evaluateConfigurationModule from '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration'
import * as updateEvaluationV2Module from '../../../services/evaluationsV2/update'
import * as factories from '../../../tests/factories'
import { captureException } from '../../../utils/datadogCapture'
import {
  recalculateAlignmentMetricJob,
  type RecalculateAlignmentMetricJobData,
} from './recalculateAlignmentMetricJob'

vi.mock(
  '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration',
  () => ({
    evaluateConfiguration: vi.fn(),
  }),
)

vi.mock('../../../services/evaluationsV2/update', () => ({
  updateEvaluationV2: vi.fn(),
}))

vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
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
    EvaluationsV2Repository: vi.fn(),
  }
})

describe('recalculateAlignmentMetricJob', () => {
  const mockEvaluateConfiguration = vi.mocked(
    evaluateConfigurationModule.evaluateConfiguration,
  )
  const mockUpdateEvaluationV2 = vi.mocked(
    updateEvaluationV2Module.updateEvaluationV2,
  )
  const mockPublisherPublishLater = vi.mocked(publisher.publishLater)
  const mockUnsafelyFindWorkspace = vi.mocked(
    unsafelyFindWorkspaceModule.unsafelyFindWorkspace,
  )
  const mockCommitsRepositoryFind = vi.fn()
  const mockEvaluationsV2RepositoryGetAtCommitByDocument = vi.fn()

  let workspace: WorkspaceDto
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

  const MODEL = 'gpt-4o'
  const MAX_ATTEMPTS = 3

  function buildJobData(
    overrides: Partial<RecalculateAlignmentMetricJobData> = {},
  ): RecalculateAlignmentMetricJobData {
    return {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluation.uuid,
      documentUuid: document.documentUuid,
      spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
        { id: 'span-1', traceId: 'trace-1', createdAt: '2024-01-01' },
      ],
      spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
        { id: 'span-2', traceId: 'trace-2', createdAt: '2024-01-02' },
      ],
      hasEvaluationConfigurationChanged: false,
      ...overrides,
    }
  }

  function createMockJob(
    data: RecalculateAlignmentMetricJobData,
    attemptsMade = 0,
    dependenciesCount = {
      failed: 0,
      ignored: 0,
      processed: 10,
      unprocessed: 0,
    },
  ): Job<RecalculateAlignmentMetricJobData> {
    return {
      id: 'test-job-id',
      data,
      attemptsMade,
      opts: {
        attempts: MAX_ATTEMPTS,
      },
      getDependenciesCount: vi.fn().mockResolvedValue(dependenciesCount),
      getChildrenValues: vi.fn().mockResolvedValue({
        'child-1': { passed: true },
        'child-2': { passed: false },
      }),
    } as unknown as Job<RecalculateAlignmentMetricJobData>
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
    document = projectData.documents[0]!

    const { issue } = await factories.createIssue({
      document,
      workspace,
      project: projectData.project,
    })

    evaluation = (await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        provider: 'openai',
        model: MODEL,
        criteria: 'test criteria',
        passDescription: 'pass',
        failDescription: 'fail',
      },
      evaluateLiveLogs: true,
      issueId: issue.id,
    })) as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

    mockUnsafelyFindWorkspace.mockResolvedValue(workspace)
    mockCommitsRepositoryFind.mockResolvedValue(Result.ok(commit))
    vi.mocked(CommitsRepository).mockImplementation(
      () =>
        ({
          find: mockCommitsRepositoryFind,
        }) as unknown as CommitsRepository,
    )
    mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
      Result.ok(evaluation),
    )
    vi.mocked(EvaluationsV2Repository).mockImplementation(
      () =>
        ({
          getAtCommitByDocument:
            mockEvaluationsV2RepositoryGetAtCommitByDocument,
        }) as unknown as EvaluationsV2Repository,
    )

    mockEvaluateConfiguration.mockResolvedValue(
      Result.ok({
        mcc: 0.8,
        confusionMatrix: {
          truePositives: 5,
          trueNegatives: 3,
          falsePositives: 1,
          falseNegatives: 1,
        },
        latestPositiveSpanDate: '2024-01-01',
        latestNegativeSpanDate: '2024-01-02',
      }),
    )

    mockUpdateEvaluationV2.mockResolvedValue(
      Result.ok({ evaluation, target: undefined }),
    )
  })

  describe('Success cases', () => {
    it('should successfully recalculate alignment metric', async () => {
      const jobData = buildJobData()
      const job = createMockJob(jobData)

      await recalculateAlignmentMetricJob(job)

      expect(mockEvaluateConfiguration).toHaveBeenCalledWith({
        childrenValues: {
          'child-1': { passed: true },
          'child-2': { passed: false },
        },
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation:
          jobData.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation:
          jobData.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
        alreadyCalculatedAlignmentMetricMetadata:
          evaluation.alignmentMetricMetadata ?? undefined,
      })

      expect(mockUpdateEvaluationV2).toHaveBeenCalledWith({
        evaluation,
        workspace,
        commit,
        alignmentMetricMetadata: expect.objectContaining({
          confusionMatrix: {
            truePositives: 5,
            trueNegatives: 3,
            falsePositives: 1,
            falseNegatives: 1,
          },
          lastProcessedPositiveSpanDate: '2024-01-01',
          lastProcessedNegativeSpanDate: '2024-01-02',
          recalculatingAt: undefined,
        }),
        force: true,
      })

      expect(mockPublisherPublishLater).toHaveBeenCalledWith({
        type: 'evaluationV2AlignmentUpdated',
        data: {
          workspaceId: workspace.id,
          evaluationUuid: evaluation.uuid,
          alignmentMetricMetadata: expect.objectContaining({
            confusionMatrix: {
              truePositives: 5,
              trueNegatives: 3,
              falsePositives: 1,
              falseNegatives: 1,
            },
            recalculatingAt: undefined,
          }),
        },
      })
    })

    it('should ignore existing alignment metadata when configuration has changed', async () => {
      const jobData = buildJobData({ hasEvaluationConfigurationChanged: true })
      const job = createMockJob(jobData)

      await recalculateAlignmentMetricJob(job)

      expect(mockEvaluateConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          alreadyCalculatedAlignmentMetricMetadata: undefined,
        }),
      )
    })

    it('should use existing alignment metadata when configuration has not changed', async () => {
      const existingMetadata = {
        alignmentHash: 'existing-hash',
        confusionMatrix: {
          truePositives: 10,
          trueNegatives: 5,
          falsePositives: 2,
          falseNegatives: 1,
        },
        lastProcessedPositiveSpanDate: '2023-12-01',
        lastProcessedNegativeSpanDate: '2023-12-02',
      }

      const evaluationWithMetadata = {
        ...evaluation,
        alignmentMetricMetadata: existingMetadata,
      }

      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluationWithMetadata),
      )

      const jobData = buildJobData({ hasEvaluationConfigurationChanged: false })
      const job = createMockJob(jobData)

      await recalculateAlignmentMetricJob(job)

      expect(mockEvaluateConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          alreadyCalculatedAlignmentMetricMetadata: existingMetadata,
        }),
      )
    })

    it('should preserve existing cutoff dates when new ones are not provided', async () => {
      const existingMetadata = {
        alignmentHash: 'existing-hash',
        confusionMatrix: {
          truePositives: 10,
          trueNegatives: 5,
          falsePositives: 2,
          falseNegatives: 1,
        },
        lastProcessedPositiveSpanDate: '2023-12-01',
        lastProcessedNegativeSpanDate: '2023-12-02',
      }

      const evaluationWithMetadata = {
        ...evaluation,
        alignmentMetricMetadata: existingMetadata,
      }

      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluationWithMetadata),
      )

      mockEvaluateConfiguration.mockResolvedValue(
        Result.ok({
          mcc: 0.8,
          confusionMatrix: {
            truePositives: 5,
            trueNegatives: 3,
            falsePositives: 1,
            falseNegatives: 1,
          },
          latestPositiveSpanDate: undefined,
          latestNegativeSpanDate: undefined,
        }),
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData)

      await recalculateAlignmentMetricJob(job)

      expect(mockUpdateEvaluationV2).toHaveBeenCalledWith(
        expect.objectContaining({
          alignmentMetricMetadata: expect.objectContaining({
            lastProcessedPositiveSpanDate: '2023-12-01',
            lastProcessedNegativeSpanDate: '2023-12-02',
          }),
          force: true,
        }),
      )
    })
  })

  describe('Too many failed children', () => {
    it('should throw error when too many children have failed', async () => {
      const jobData = buildJobData()
      const job = createMockJob(jobData, 0, {
        failed: 5,
        ignored: 2,
        processed: 3,
        unprocessed: 10,
      })

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow(
        '5 failed and 2 ignored children. Waiting for 10 unprocessed children to complete',
      )

      expect(mockEvaluateConfiguration).not.toHaveBeenCalled()
      expect(mockUpdateEvaluationV2).not.toHaveBeenCalled()
    })
  })

  describe('Error handling - not last attempt', () => {
    it('should throw error but not update evaluation on non-last attempt', async () => {
      ;(mockEvaluateConfiguration as any).mockResolvedValue(
        Result.error(new Error('Configuration evaluation failed')),
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData, 0) // attemptsMade = 0, not last attempt

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow(
        'Configuration evaluation failed',
      )

      expect(captureException).not.toHaveBeenCalled()
      expect(mockUpdateEvaluationV2).not.toHaveBeenCalled()
      expect(mockPublisherPublishLater).not.toHaveBeenCalled()
    })
  })

  describe('Error handling - last attempt', () => {
    it('should capture exception and update evaluation with failed state on last attempt', async () => {
      ;(mockEvaluateConfiguration as any).mockResolvedValue(
        Result.error(new Error('Configuration evaluation failed')),
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData, MAX_ATTEMPTS - 1) // Last attempt

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow(
        'Configuration evaluation failed',
      )

      expect(captureException).toHaveBeenCalledWith(expect.any(Error))
      expect(mockUpdateEvaluationV2).toHaveBeenCalledWith(
        expect.objectContaining({
          alignmentMetricMetadata: expect.objectContaining({
            recalculatingAt: undefined,
          }),
          force: true,
        }),
      )
      expect(mockPublisherPublishLater).toHaveBeenCalledWith({
        type: 'evaluationV2AlignmentUpdated',
        data: {
          workspaceId: workspace.id,
          evaluationUuid: evaluation.uuid,
          alignmentMetricMetadata: expect.objectContaining({
            recalculatingAt: undefined,
          }),
        },
      })
    })

    it('should preserve existing metadata in failed state', async () => {
      const existingMetadata = {
        alignmentHash: 'existing-hash',
        confusionMatrix: {
          truePositives: 10,
          trueNegatives: 5,
          falsePositives: 2,
          falseNegatives: 1,
        },
        lastProcessedPositiveSpanDate: '2023-12-01',
        lastProcessedNegativeSpanDate: '2023-12-02',
      }

      const evaluationWithMetadata = {
        ...evaluation,
        alignmentMetricMetadata: existingMetadata,
      }

      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluationWithMetadata),
      )
      ;(mockEvaluateConfiguration as any).mockResolvedValue(
        Result.error(new Error('Failed')),
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData, MAX_ATTEMPTS - 1)

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow('Failed')

      expect(mockUpdateEvaluationV2).toHaveBeenCalledWith(
        expect.objectContaining({
          alignmentMetricMetadata: expect.objectContaining({
            alignmentHash: 'existing-hash',
            confusionMatrix: existingMetadata.confusionMatrix,
            lastProcessedPositiveSpanDate: '2023-12-01',
            lastProcessedNegativeSpanDate: '2023-12-02',
            recalculatingAt: undefined,
          }),
          force: true,
        }),
      )
    })

    it('should use default values when no existing metadata on failure', async () => {
      ;(mockEvaluateConfiguration as any).mockResolvedValue(
        Result.error(new Error('Failed')),
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData, MAX_ATTEMPTS - 1)

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow('Failed')

      expect(mockUpdateEvaluationV2).toHaveBeenCalledWith(
        expect.objectContaining({
          alignmentMetricMetadata: expect.objectContaining({
            alignmentHash: '',
            confusionMatrix: {
              truePositives: 0,
              trueNegatives: 0,
              falsePositives: 0,
              falseNegatives: 0,
            },
            recalculatingAt: undefined,
          }),
          force: true,
        }),
      )
    })

    it('should silently catch updateEvaluationV2 errors on failure path', async () => {
      ;(mockEvaluateConfiguration as any).mockResolvedValue(
        Result.error(new Error('Original error')),
      )
      mockUpdateEvaluationV2.mockRejectedValue(new Error('Update failed'))

      const jobData = buildJobData()
      const job = createMockJob(jobData, MAX_ATTEMPTS - 1)

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow(
        'Original error',
      )

      expect(captureException).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('Data access errors', () => {
    it('should throw error if workspace not found', async () => {
      mockUnsafelyFindWorkspace.mockResolvedValue(
        undefined as unknown as WorkspaceDto,
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData)

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow(
        'Workspace not found',
      )

      expect(mockEvaluateConfiguration).not.toHaveBeenCalled()
    })

    it('should throw error if commit not found', async () => {
      mockCommitsRepositoryFind.mockResolvedValue(
        Result.error(new NotFoundError('Commit not found')),
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData)

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow(
        'Commit not found',
      )

      expect(mockEvaluateConfiguration).not.toHaveBeenCalled()
    })

    it('should throw error if evaluation not found', async () => {
      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.error(new NotFoundError('Evaluation not found')),
      )

      const jobData = buildJobData()
      const job = createMockJob(jobData)

      await expect(recalculateAlignmentMetricJob(job)).rejects.toThrow()

      expect(mockEvaluateConfiguration).not.toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('should handle empty span pairs', async () => {
      const jobData = buildJobData({
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [],
      })
      const job = createMockJob(jobData)

      await recalculateAlignmentMetricJob(job)

      expect(mockEvaluateConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [],
          spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [],
        }),
      )
    })

    it('should handle null alignmentMetricMetadata', async () => {
      const evaluationWithNullMetadata = {
        ...evaluation,
        alignmentMetricMetadata: null,
      }

      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluationWithNullMetadata),
      )

      const jobData = buildJobData({ hasEvaluationConfigurationChanged: false })
      const job = createMockJob(jobData)

      await recalculateAlignmentMetricJob(job)

      expect(mockEvaluateConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          alreadyCalculatedAlignmentMetricMetadata: undefined,
        }),
      )
    })

    it('should correctly identify last attempt based on attemptsMade', async () => {
      ;(mockEvaluateConfiguration as any).mockResolvedValue(
        Result.error(new Error('Failed')),
      )

      const jobData = buildJobData()

      // Not last attempt (attemptsMade = 1, so attempt 2 of 3)
      const job1 = createMockJob(jobData, 1)
      await expect(recalculateAlignmentMetricJob(job1)).rejects.toThrow()
      expect(captureException).not.toHaveBeenCalled()

      vi.clearAllMocks()

      // Last attempt (attemptsMade = 2, so attempt 3 of 3)
      const job2 = createMockJob(jobData, 2)
      await expect(recalculateAlignmentMetricJob(job2)).rejects.toThrow()
      expect(captureException).toHaveBeenCalled()
    })
  })
})
