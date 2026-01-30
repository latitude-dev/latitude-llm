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
import { createValidationFlow } from './createValidationFlow'
import { FlowJob } from 'bullmq'

vi.mock('../../../jobs/flows', async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import('../../../jobs/flows')
  const mockEnqueueFlow = vi.fn()
  return {
    ...actual,
    enqueueFlow: mockEnqueueFlow,
    __mockEnqueueFlow: mockEnqueueFlow,
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
  let mockEnqueueFlow: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const flowsMod = await import('../../../jobs/flows')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockEnqueueFlow = (flowsMod as any).__mockEnqueueFlow

    mockEnqueueFlow.mockResolvedValue(
      Result.ok({ flowJobId: TEST_JOB_ID, rootJobId: TEST_JOB_ID }),
    )

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
  })

  it('creates validation flow successfully with spans', async () => {
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

    const negativeSpans = []
    for (let i = 0; i < 2; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-negative-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

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
    expect(validationFlowJob.id).toBeDefined()

    expect(mockEnqueueFlow).toHaveBeenCalledTimes(1)
    const flow = mockEnqueueFlow.mock.calls[0]![0] as FlowJob
    expect(flow.name).toBe('validateGeneratedEvaluationJob')
    expect(flow.data.workspaceId).toBe(workspace.id)
    expect(flow.data.commitId).toBe(commit.id)
    expect(flow.data.workflowUuid).toBe(TEST_WORKFLOW_UUID)
    expect(flow.data.generationAttempt).toBe(1)
    expect(flow.data.evaluationUuid).toBe(evaluation.uuid)
    expect(flow.data.documentUuid).toBe(document.documentUuid)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(2)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(2)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation[0]
        .createdAt,
    ).toBeDefined()
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation[0]
        .createdAt,
    ).toBeDefined()
    expect(flow.children).toHaveLength(4)
    expect(flow.children![0]!.name).toBe('runEvaluationV2Job')
    expect(flow.children![0]!.data.dry).toBe(true)
  })

  it('creates flow with empty spans when no spans are found', async () => {
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
    expect(validationFlowJob.id).toBeDefined()

    const flow = mockEnqueueFlow.mock.calls[0]![0] as FlowJob
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(0)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(0)
    expect(flow.children).toHaveLength(0)
  })
})
