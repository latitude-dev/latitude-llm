import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  EvaluationV2,
  SpanType,
  EvaluationType,
  HumanEvaluationMetric,
} from '@latitude-data/constants'
import { Result } from '@latitude-data/core/lib/Result'
import * as factories from '../../../tests/factories'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  createEvaluationResultV2,
  createEvaluationV2,
  createIssueEvaluationResult,
  createSpan,
} from '../../../tests/factories'
import { SpanWithDetails } from '@latitude-data/constants'
import { FlowProducer } from 'bullmq'
import { buildRedisConnection } from '../../../redis'
import { createValidationFlow } from './createValidationFlow'

vi.mock('bullmq', () => ({
  FlowProducer: vi.fn(),
}))

vi.mock(import('../../../redis'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildRedisConnection: vi.fn(),
  }
})

const TEST_JOB_ID = 'test-job-id'
const TEST_WORKFLOW_UUID = 'test-workflow-uuid'
const TEST_PROVIDER_NAME = 'openai'
const TEST_MODEL = 'gpt-4o'

describe('createValidationFlow', () => {
  let workspace: Workspace
  let commit: Commit
  let issue: Issue
  let document: DocumentVersion
  let evaluation: EvaluationV2
  let mockFlowProducer: any
  let mockRedisConnection: any

  beforeEach(async () => {
    vi.clearAllMocks()

    const projectData = await factories.createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = projectData.workspace
    commit = projectData.commit
    document = projectData.documents[0]!

    const issueData = await factories.createIssue({
      document,
      workspace,
    })
    issue = issueData.issue

    evaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Binary,
    })

    // Mock Redis connection
    mockRedisConnection = {}
    vi.mocked(buildRedisConnection).mockResolvedValue(mockRedisConnection)

    // Mock FlowProducer
    mockFlowProducer = {
      add: vi.fn().mockResolvedValue({
        job: { id: TEST_JOB_ID },
      }),
    }
    vi.mocked(FlowProducer).mockImplementation(() => mockFlowProducer)
  })

  it('creates validation flow successfully with spans', async () => {
    // Create spans with issues (positive)
    const positiveSpans = []
    for (let i = 0; i < 2; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-positive-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      positiveSpans.push(span)
    }

    // Create spans without issues (negative)
    const negativeSpans = []
    for (let i = 0; i < 2; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-negative-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create evaluation result for the span (not linked to issue)
      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      negativeSpans.push(span)
    }

    const result = await createValidationFlow({
      workspace,
      commit,
      workflowUuid: TEST_WORKFLOW_UUID,
      evaluationToEvaluate: evaluation,
      issue,
      generationAttempt: 1,
      providerName: TEST_PROVIDER_NAME,
      model: TEST_MODEL,
    })

    expect(Result.isOk(result)).toBe(true)
    const validationFlowJob = result.unwrap()
    expect(validationFlowJob.id).toBe(TEST_JOB_ID)

    // Verify FlowProducer was called correctly
    expect(mockFlowProducer.add).toHaveBeenCalledTimes(1)
    const callArgs = mockFlowProducer.add.mock.calls[0]![0]
    expect(callArgs.name).toBe('validateGeneratedEvaluationJob')
    expect(callArgs.data.workspaceId).toBe(workspace.id)
    expect(callArgs.data.commitId).toBe(commit.id)
    expect(callArgs.data.workflowUuid).toBe(TEST_WORKFLOW_UUID)
    expect(callArgs.data.generationAttempt).toBe(1)
    expect(callArgs.data.evaluationUuid).toBe(evaluation.uuid)
    expect(callArgs.data.documentUuid).toBe(document.documentUuid)
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(2)
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(2)
    expect(callArgs.children).toHaveLength(4) // 2 positive + 2 negative spans
    expect(callArgs.children[0]!.name).toBe('runEvaluationV2Job')
    expect(callArgs.children[0]!.data.dry).toBe(true)
  })

  it('returns error when no spans are found', async () => {
    const result = await createValidationFlow({
      workspace,
      commit,
      workflowUuid: TEST_WORKFLOW_UUID,
      evaluationToEvaluate: evaluation,
      issue,
      generationAttempt: 1,
      providerName: TEST_PROVIDER_NAME,
      model: TEST_MODEL,
    })

    expect(Result.isOk(result)).toBe(true)
    const validationFlowJob = result.unwrap()
    expect(validationFlowJob.id).toBe(TEST_JOB_ID)

    // Verify FlowProducer was called with empty arrays
    const callArgs = mockFlowProducer.add.mock.calls[0]![0]
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(0)
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(0)
    expect(callArgs.children).toHaveLength(0)
  })

  it('returns error when FlowProducer fails to create job', async () => {
    mockFlowProducer.add.mockResolvedValue({
      job: { id: undefined },
    })

    const result = await createValidationFlow({
      workspace,
      commit,
      workflowUuid: TEST_WORKFLOW_UUID,
      evaluationToEvaluate: evaluation,
      issue,
      generationAttempt: 1,
      providerName: TEST_PROVIDER_NAME,
      model: TEST_MODEL,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error?.message).toBe(
      'Failed to create evaluation validation flow',
    )
  })
})
