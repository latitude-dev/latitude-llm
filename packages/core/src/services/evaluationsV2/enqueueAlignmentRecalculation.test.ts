import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import * as queuesModule from '../../jobs/queues'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { createEvaluationV2 as createEvaluationV2Svc } from './create'
import {
  enqueueAlignmentRecalculation,
  maybeEnqueueAlignmentRecalculation,
} from './enqueueAlignmentRecalculation'

describe('enqueueAlignmentRecalculation', () => {
  let mocks: {
    publisher: MockInstance
    maintenanceQueueAdd: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      project: p,
      documents,
      commit: c,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
      skipMerge: true,
    })

    workspace = w
    project = p
    commit = c
    document = documents[0]!

    const { issue } = await factories.createIssue({
      document,
      workspace,
      project,
    })

    const createResult = await createEvaluationV2Svc({
      document,
      commit,
      workspace,
      settings: {
        name: 'test evaluation',
        description: 'test',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          provider: 'openai',
          model: 'gpt-4o',
          criteria: 'original criteria',
          passDescription: 'pass',
          failDescription: 'fail',
        },
      },
      options: {
        evaluateLiveLogs: true,
      },
      issueId: issue.id,
    }).then((r) => r.unwrap())

    evaluation = createResult.evaluation as EvaluationV2<
      EvaluationType.Llm,
      LlmEvaluationMetric.Binary
    >

    const mockMaintenanceQueueAdd = vi.fn().mockResolvedValue({})

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
      maintenanceQueueAdd: mockMaintenanceQueueAdd,
    }

    vi.spyOn(queuesModule, 'queues').mockResolvedValue({
      maintenanceQueue: {
        add: mockMaintenanceQueueAdd,
      },
    } as any)
  })

  describe('enqueueAlignmentRecalculation', () => {
    it('does not enqueue when there is no issue ID', async () => {
      const evaluationWithoutIssue = {
        ...evaluation,
        issueId: null,
      }

      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: { ...evaluationWithoutIssue, issueId: null },
        newEvaluation: evaluationWithoutIssue,
        commit,
      })

      expect(result.enqueued).toBe(false)
      expect(mocks.publisher).not.toHaveBeenCalled()
      expect(mocks.maintenanceQueueAdd).not.toHaveBeenCalled()
    })

    it('does not enqueue when configuration hash has not changed', async () => {
      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: evaluation,
        newEvaluation: evaluation,
        commit,
      })

      expect(result.enqueued).toBe(false)
      expect(mocks.publisher).not.toHaveBeenCalled()
      expect(mocks.maintenanceQueueAdd).not.toHaveBeenCalled()
    })

    it('enqueues when configuration hash has changed', async () => {
      const newEvaluation = {
        ...evaluation,
        configuration: {
          ...evaluation.configuration,
          criteria: 'new criteria',
        },
      }

      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: evaluation,
        newEvaluation,
        commit,
      })

      expect(result.enqueued).toBe(true)
      expect(result.alignmentMetricMetadata).toBeDefined()
      expect(result.alignmentMetricMetadata?.recalculatingAt).toBeDefined()

      expect(mocks.publisher).toHaveBeenCalledWith({
        type: 'evaluationV2AlignmentUpdated',
        data: {
          workspaceId: workspace.id,
          evaluationUuid: evaluation.uuid,
          alignmentMetricMetadata: expect.objectContaining({
            recalculatingAt: expect.any(String),
          }),
        },
      })

      expect(mocks.maintenanceQueueAdd).toHaveBeenCalledWith(
        'updateEvaluationAlignmentJob',
        {
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          documentUuid: evaluation.documentUuid,
          issueId: evaluation.issueId,
          source: 'configChange',
        },
        { attempts: 1 },
      )
    })

    it('enqueues when passDescription changes', async () => {
      const newEvaluation = {
        ...evaluation,
        configuration: {
          ...evaluation.configuration,
          passDescription: 'new pass description',
        },
      }

      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: evaluation,
        newEvaluation,
        commit,
      })

      expect(result.enqueued).toBe(true)
      expect(mocks.maintenanceQueueAdd).toHaveBeenCalled()
    })

    it('enqueues when failDescription changes', async () => {
      const newEvaluation = {
        ...evaluation,
        configuration: {
          ...evaluation.configuration,
          failDescription: 'new fail description',
        },
      }

      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: evaluation,
        newEvaluation,
        commit,
      })

      expect(result.enqueued).toBe(true)
      expect(mocks.maintenanceQueueAdd).toHaveBeenCalled()
    })

    it('enqueues when model changes', async () => {
      const newEvaluation = {
        ...evaluation,
        configuration: {
          ...evaluation.configuration,
          model: 'gpt-4-turbo',
        },
      }

      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: evaluation,
        newEvaluation,
        commit,
      })

      expect(result.enqueued).toBe(true)
      expect(mocks.maintenanceQueueAdd).toHaveBeenCalled()
    })

    it('uses issue ID from old evaluation when new evaluation has none', async () => {
      const newEvaluation = {
        ...evaluation,
        issueId: null,
        configuration: {
          ...evaluation.configuration,
          criteria: 'new criteria',
        },
      }

      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: evaluation,
        newEvaluation: newEvaluation as any,
        commit,
      })

      expect(result.enqueued).toBe(true)
      expect(mocks.maintenanceQueueAdd).toHaveBeenCalledWith(
        'updateEvaluationAlignmentJob',
        expect.objectContaining({
          issueId: evaluation.issueId,
        }),
        { attempts: 1 },
      )
    })

    it('preserves existing alignment metric metadata fields', async () => {
      const existingMetadata = {
        alignmentHash: 'existing-hash',
        confusionMatrix: {
          truePositives: 10,
          trueNegatives: 5,
          falsePositives: 2,
          falseNegatives: 1,
        },
        lastProcessedPositiveSpanDate: '2024-01-01',
        lastProcessedNegativeSpanDate: '2024-01-02',
      }

      const evaluationWithMetadata = {
        ...evaluation,
        alignmentMetricMetadata: existingMetadata,
      }

      const newEvaluation = {
        ...evaluationWithMetadata,
        configuration: {
          ...evaluation.configuration,
          criteria: 'new criteria',
        },
      }

      const result = await enqueueAlignmentRecalculation({
        oldEvaluation: evaluationWithMetadata,
        newEvaluation,
        commit,
      })

      expect(result.enqueued).toBe(true)
      expect(result.alignmentMetricMetadata).toEqual(
        expect.objectContaining({
          alignmentHash: 'existing-hash',
          confusionMatrix: existingMetadata.confusionMatrix,
          lastProcessedPositiveSpanDate: '2024-01-01',
          lastProcessedNegativeSpanDate: '2024-01-02',
          recalculatingAt: expect.any(String),
        }),
      )
    })
  })

  describe('maybeEnqueueAlignmentRecalculation', () => {
    it('does not enqueue for non-LLM evaluations', async () => {
      const ruleEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      mocks.publisher.mockClear()
      mocks.maintenanceQueueAdd.mockClear()

      const result = await maybeEnqueueAlignmentRecalculation({
        oldEvaluation: ruleEvaluation,
        newEvaluation: {
          ...ruleEvaluation,
          name: 'new name',
        },
        commit,
      })

      expect(result.enqueued).toBe(false)
      expect(mocks.publisher).not.toHaveBeenCalled()
      expect(mocks.maintenanceQueueAdd).not.toHaveBeenCalled()
    })

    it('enqueues for LLM Binary evaluations when config changes', async () => {
      const newEvaluation = {
        ...evaluation,
        configuration: {
          ...evaluation.configuration,
          criteria: 'new criteria',
        },
      }

      const result = await maybeEnqueueAlignmentRecalculation({
        oldEvaluation: evaluation,
        newEvaluation,
        commit,
      })

      expect(result.enqueued).toBe(true)
      expect(mocks.maintenanceQueueAdd).toHaveBeenCalled()
    })
  })
})
