import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../../lib/Result'
import { NotFoundError } from '../../../lib/errors'
import { MIN_QUALITY_METRIC_THRESHOLD } from '@latitude-data/constants/issues'
import {
  EvaluationV2,
  Providers,
  ActiveEvaluation,
} from '@latitude-data/constants'
import * as factories from '../../../tests/factories'
import type { Commit } from '../../../schema/models/types/Commit'
import type { Workspace } from '../../../schema/models/types/Workspace'
import type { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import {
  calculateQualityMetricJob,
  type CalculateQualityMetricJobData,
} from './calculateQualityMetricJob'
import * as evaluateConfigurationModule from '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration'
import * as updateEvaluationV2Module from '../../../services/evaluationsV2/update'
import * as endActiveEvaluationModule from '../../../services/evaluationsV2/active/end'
import * as failActiveEvaluationModule from '../../../services/evaluationsV2/active/fail'
import * as deleteEvaluationV2Module from '../../../services/evaluationsV2/delete'
import * as queuesModule from '../../queues'
import { captureException } from '../../../utils/datadogCapture'
import {
  EvaluationsV2Repository,
  CommitsRepository,
} from '../../../repositories'

// Mock dependencies
vi.mock(
  '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration',
  () => ({
    evaluateConfiguration: vi.fn(),
  }),
)

vi.mock('../../../services/evaluationsV2/update', () => ({
  updateEvaluationV2: vi.fn(),
}))

vi.mock('../../../services/evaluationsV2/active/end', () => ({
  endActiveEvaluation: vi.fn(),
}))

vi.mock('../../../services/evaluationsV2/active/fail', () => ({
  failActiveEvaluation: vi.fn(),
}))

vi.mock('../../../services/evaluationsV2/delete', () => ({
  deleteEvaluationV2: vi.fn(),
}))

vi.mock('../../queues', () => ({
  queues: vi.fn(),
}))

vi.mock('../../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

describe('calculateQualityMetricJob', () => {
  const mockEvaluateConfiguration = vi.mocked(
    evaluateConfigurationModule.evaluateConfiguration,
  )
  const mockUpdateEvaluationV2 = vi.mocked(
    updateEvaluationV2Module.updateEvaluationV2,
  )
  const mockEndActiveEvaluation = vi.mocked(
    endActiveEvaluationModule.endActiveEvaluation,
  )
  const mockFailActiveEvaluation = vi.mocked(
    failActiveEvaluationModule.failActiveEvaluation,
  )
  const mockDeleteEvaluationV2 = vi.mocked(
    deleteEvaluationV2Module.deleteEvaluationV2,
  )
  const mockQueues = vi.mocked(queuesModule.queues)

  let workspace: Workspace
  let commit: Commit
  let evaluation: EvaluationV2
  let document: DocumentVersion
  let jobData: Job<CalculateQualityMetricJobData>
  const WORKFLOW_UUID = 'test-workflow-uuid'

  function buildJobData(
    overrides: Partial<CalculateQualityMetricJobData> = {},
  ): CalculateQualityMetricJobData {
    return {
      workspaceId: workspace.id,
      commitId: commit.id,
      workflowUuid: WORKFLOW_UUID,
      generationAttempt: 1,
      evaluationUuid: evaluation.uuid,
      documentUuid: document.documentUuid,
      issueId: 1,
      providerName: 'openai',
      model: 'gpt-4o',
      spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
        { spanId: 'span-1', traceId: 'trace-1' },
      ],
      spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
        { spanId: 'span-2', traceId: 'trace-2' },
      ],
      ...overrides,
    }
  }

  function createMockJob(
    data: CalculateQualityMetricJobData,
    attemptsMade = 0,
    maxAttempts = 3,
  ): Job<CalculateQualityMetricJobData> {
    return {
      id: 'test-job-id',
      data,
      attemptsMade,
      opts: { attempts: maxAttempts },
      getDependenciesCount: vi.fn().mockResolvedValue({
        failed: 0,
        ignored: 0,
        processed: 10,
        unprocessed: 0,
      }),
      getChildrenValues: vi.fn().mockResolvedValue({
        'job-1': { hasPassed: true },
        'job-2': { hasPassed: false },
      }),
    } as unknown as Job<CalculateQualityMetricJobData>
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = setup.workspace
    commit = setup.commit
    document = setup.documents[0]!

    evaluation = await factories.createEvaluationV2({
      workspace,
      document,
      commit,
    })

    // Mock repositories
    vi.spyOn(CommitsRepository.prototype, 'find').mockImplementation(
      async (id: string | number | undefined | null) => {
        if (id === commit.id) {
          return Result.ok(commit)
        }
        return Result.error(new NotFoundError('Commit not found'))
      },
    )

    vi.spyOn(
      EvaluationsV2Repository.prototype,
      'getAtCommitByDocument',
    ).mockImplementation(async ({ evaluationUuid: uuid }) => {
      if (uuid === evaluation.uuid) {
        return Result.ok(evaluation)
      }
      return Result.error(new NotFoundError('Evaluation not found'))
    })

    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'new-job-id' }),
    }
    mockQueues.mockResolvedValue({
      generateEvaluationsQueue: mockQueue,
    } as unknown as Awaited<ReturnType<typeof queuesModule.queues>>)
  })

  describe('Case 1: Job ends well (MCC >= threshold)', () => {
    beforeEach(() => {
      jobData = createMockJob(buildJobData())
      mockEvaluateConfiguration.mockResolvedValue(
        Result.ok({
          mcc: MIN_QUALITY_METRIC_THRESHOLD + 10,
          confusionMatrix: {
            truePositives: 8,
            trueNegatives: 8,
            falsePositives: 2,
            falseNegatives: 2,
          },
        }),
      )
      mockUpdateEvaluationV2.mockResolvedValue(Result.ok({ evaluation }))
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))
    })

    it('should update evaluation with quality metric and end active evaluation', async () => {
      await calculateQualityMetricJob(jobData)

      expect(mockEvaluateConfiguration).toHaveBeenCalledWith({
        childrenValues: expect.any(Object),
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: [
          { spanId: 'span-1', traceId: 'trace-1' },
        ],
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: [
          { spanId: 'span-2', traceId: 'trace-2' },
        ],
      })

      expect(mockUpdateEvaluationV2).toHaveBeenCalledWith({
        evaluation: expect.objectContaining({ uuid: evaluation.uuid }),
        workspace,
        commit,
        qualityMetric: MIN_QUALITY_METRIC_THRESHOLD + 10,
        qualityMetricMetadata: {
          confusionMatrix: {
            truePositives: 8,
            trueNegatives: 8,
            falsePositives: 2,
            falseNegatives: 2,
          },
        },
      })

      expect(mockEndActiveEvaluation).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        workflowUuid: WORKFLOW_UUID,
      })

      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockDeleteEvaluationV2).not.toHaveBeenCalled()
    })
  })

  describe('Case 2: Fail attempt 1,2... before last attempt', () => {
    beforeEach(() => {
      jobData = createMockJob(buildJobData(), 1, 3) // attemptsMade: 1, maxAttempts: 3
      // Mock evaluateConfiguration to return an error Result, which will throw when unwrapped
      mockEvaluateConfiguration.mockResolvedValue(
        Result.error(new Error('Test error')),
      )
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))
      mockFailActiveEvaluation.mockResolvedValue(
        Result.ok({
          workflowUuid: WORKFLOW_UUID,
          issueId: 1,
          queuedAt: new Date(),
        } as ActiveEvaluation),
      )
    })

    it('should throw error but not fail or end active evaluation', async () => {
      // The error should propagate (no return in finally for this case)
      // This allows BullMQ to retry the job without modifying the active evaluation state
      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow(
        'Test error',
      )

      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
      expect(mockUpdateEvaluationV2).not.toHaveBeenCalled()
    })
  })

  describe('Case 3: Fail last attempt', () => {
    beforeEach(() => {
      jobData = createMockJob(buildJobData(), 2, 3) // attemptsMade: 3, maxAttempts: 3 (last attempt)
      // Mock evaluateConfiguration to return an error Result, which will throw when unwrapped
      mockEvaluateConfiguration.mockResolvedValue(
        Result.error(new Error('Test error')),
      )
      mockDeleteEvaluationV2.mockResolvedValue(Result.ok({ evaluation }))
      mockFailActiveEvaluation.mockResolvedValue(
        Result.ok({
          workflowUuid: WORKFLOW_UUID,
          issueId: 1,
          queuedAt: new Date(),
        } as ActiveEvaluation),
      )
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))
    })

    it('should fail and end active evaluation on last attempt', async () => {
      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow(
        'Test error',
      )

      expect(mockDeleteEvaluationV2).toHaveBeenCalledWith({
        evaluation: evaluation,
        commit: commit,
        workspace: workspace,
      })

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
  })

  describe('Case 4: Retry generation (MCC < threshold)', () => {
    beforeEach(() => {
      jobData = createMockJob(buildJobData())
      mockEvaluateConfiguration.mockResolvedValue(
        Result.ok({
          mcc: MIN_QUALITY_METRIC_THRESHOLD - 10,
          confusionMatrix: {
            truePositives: 2,
            trueNegatives: 2,
            falsePositives: 8,
            falseNegatives: 8,
          },
        }),
      )
      mockDeleteEvaluationV2.mockResolvedValue(Result.ok({ evaluation }))
    })

    it('should delete evaluation, queue new generation job, and not fail or end active evaluation', async () => {
      await calculateQualityMetricJob(jobData)

      expect(mockDeleteEvaluationV2).toHaveBeenCalledWith({
        evaluation: expect.objectContaining({ uuid: evaluation.uuid }),
        commit,
        workspace,
      })

      const { generateEvaluationsQueue } = await mockQueues()
      expect(generateEvaluationsQueue.add).toHaveBeenCalledWith(
        'generateEvaluationV2FromIssueJob',
        {
          workspaceId: workspace.id,
          commitId: commit.id,
          issueId: 1,
          providerName: 'openai',
          model: 'gpt-4o',
          workflowUuid: WORKFLOW_UUID,
          generationAttempt: 2, // incremented
        },
        {
          jobId: `generateEvaluationV2FromIssueJob:wf=${WORKFLOW_UUID}:generationAttempt=2`,
        },
      )

      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
      expect(mockUpdateEvaluationV2).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('should throw error if workspace not found', async () => {
      jobData = createMockJob({
        ...buildJobData(),
        workspaceId: 999999,
      })

      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow(
        NotFoundError,
      )
      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow(
        'Workspace not found',
      )
    })

    it('should throw error if commit not found', async () => {
      jobData = createMockJob({
        ...buildJobData(),
        commitId: 999999,
      })

      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow(
        'Commit not found',
      )
    })

    it('should throw error if too many failed evaluation runs', async () => {
      jobData = createMockJob(buildJobData(), 3, 3) // last attempt to test error handling
      jobData.getDependenciesCount = vi.fn().mockResolvedValue({
        failed: 5,
        ignored: 1,
        processed: 10,
        unprocessed: 0,
      })
      // The job will throw before evaluateConfiguration is called
      mockFailActiveEvaluation.mockResolvedValue(
        Result.ok({
          workflowUuid: WORKFLOW_UUID,
          issueId: 1,
          queuedAt: new Date(),
        } as ActiveEvaluation),
      )
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))

      await calculateQualityMetricJob(jobData)

      expect(mockDeleteEvaluationV2).toHaveBeenCalled()
      expect(mockFailActiveEvaluation).not.toHaveBeenCalled()
      expect(mockEndActiveEvaluation).not.toHaveBeenCalled()
    })

    it('should handle error when evaluateConfiguration fails', async () => {
      jobData = createMockJob(buildJobData(), 3, 3) // last attempt
      mockEvaluateConfiguration.mockResolvedValue(
        Result.error(new Error('Evaluation configuration error')),
      )
      mockFailActiveEvaluation.mockResolvedValue(
        Result.ok({
          workflowUuid: WORKFLOW_UUID,
          issueId: 1,
          queuedAt: new Date(),
        } as ActiveEvaluation),
      )
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))

      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow()

      expect(mockFailActiveEvaluation).toHaveBeenCalled()
      expect(mockEndActiveEvaluation).toHaveBeenCalled()
    })

    it('should handle error when updateEvaluationV2 fails', async () => {
      jobData = createMockJob(buildJobData(), 3, 3) // last attempt
      mockEvaluateConfiguration.mockResolvedValue(
        Result.ok({
          mcc: 70,
          confusionMatrix: {
            truePositives: 7,
            trueNegatives: 7,
            falsePositives: 3,
            falseNegatives: 3,
          },
        }),
      )
      mockUpdateEvaluationV2.mockResolvedValue(
        Result.error(new Error('Update failed')),
      )
      mockFailActiveEvaluation.mockResolvedValue(
        Result.ok({
          workflowUuid: WORKFLOW_UUID,
          issueId: 1,
          queuedAt: new Date(),
        } as ActiveEvaluation),
      )
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))

      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow()

      expect(mockFailActiveEvaluation).toHaveBeenCalled()
      expect(mockEndActiveEvaluation).toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('should handle MCC exactly at threshold', async () => {
      jobData = createMockJob(buildJobData())
      mockEvaluateConfiguration.mockResolvedValue(
        Result.ok({
          mcc: MIN_QUALITY_METRIC_THRESHOLD,
          confusionMatrix: {
            truePositives: 5,
            trueNegatives: 5,
            falsePositives: 5,
            falseNegatives: 5,
          },
        }),
      )
      mockUpdateEvaluationV2.mockResolvedValue(Result.ok({ evaluation }))
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))

      await calculateQualityMetricJob(jobData)

      expect(mockUpdateEvaluationV2).toHaveBeenCalledWith(
        expect.objectContaining({
          qualityMetric: MIN_QUALITY_METRIC_THRESHOLD,
          qualityMetricMetadata: {
            confusionMatrix: {
              truePositives: 5,
              trueNegatives: 5,
              falsePositives: 5,
              falseNegatives: 5,
            },
          },
        }),
      )
      expect(mockDeleteEvaluationV2).not.toHaveBeenCalled()
    })

    it('should handle MCC just below threshold', async () => {
      jobData = createMockJob(buildJobData())
      mockEvaluateConfiguration.mockResolvedValue(
        Result.ok({
          mcc: MIN_QUALITY_METRIC_THRESHOLD - 1,
          confusionMatrix: {
            truePositives: 4,
            trueNegatives: 4,
            falsePositives: 6,
            falseNegatives: 6,
          },
        }),
      )
      mockDeleteEvaluationV2.mockResolvedValue(Result.ok({ evaluation }))

      await calculateQualityMetricJob(jobData)

      expect(mockDeleteEvaluationV2).toHaveBeenCalled()
      expect(mockUpdateEvaluationV2).not.toHaveBeenCalled()
    })

    it('should handle error when failActiveEvaluation fails', async () => {
      jobData = createMockJob(buildJobData(), 3, 3) // last attempt
      mockEvaluateConfiguration.mockRejectedValue(new Error('Test error'))
      mockFailActiveEvaluation.mockResolvedValue(
        Result.error(new Error('Failed to fail')),
      )
      mockEndActiveEvaluation.mockResolvedValue(Result.ok(true))

      await expect(calculateQualityMetricJob(jobData)).rejects.toThrow(
        'Test error',
      )

      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            '[CalculateQualityMetricJob] Failed to fail active evaluation',
        }),
      )
    })

    it('should handle error when endActiveEvaluation fails', async () => {
      jobData = createMockJob(buildJobData())
      mockEvaluateConfiguration.mockResolvedValue(
        Result.ok({
          mcc: 70,
          confusionMatrix: {
            truePositives: 7,
            trueNegatives: 7,
            falsePositives: 3,
            falseNegatives: 3,
          },
        }),
      )
      mockUpdateEvaluationV2.mockResolvedValue(Result.ok({ evaluation }))
      mockEndActiveEvaluation.mockResolvedValue(
        Result.error(new Error('Failed to end')),
      )

      await calculateQualityMetricJob(jobData)

      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            '[CalculateQualityMetricJob] Failed to end active evaluation',
        }),
      )
    })
  })
})
