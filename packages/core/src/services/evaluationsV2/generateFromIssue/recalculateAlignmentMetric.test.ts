import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  EvaluationV2,
  SpanType,
  EvaluationType,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  Span,
} from '@latitude-data/constants'
import { Result } from '@latitude-data/core/lib/Result'
import * as factories from '../../../tests/factories'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { Project } from '@latitude-data/core/schema/models/types/Project'
import {
  createEvaluationResultV2,
  createEvaluationV2,
  createIssueEvaluationResult,
  createSpan,
} from '../../../tests/factories'
import { SpanWithDetails } from '@latitude-data/constants'
import { recalculateAlignmentMetric } from './recalculateAlignmentMetric'
import * as generateConfigurationHashModule from '../generateConfigurationHash'
import { FlowChildJob, FlowJob } from 'bullmq'

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

describe('recalculateAlignmentMetric', () => {
  let workspace: Workspace
  let commit: Commit
  let issue: Issue
  let document: DocumentVersion
  let project: Project
  let hitlEvaluation: EvaluationV2
  let evaluationToEvaluate: EvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >
  let mockEnqueueFlow: ReturnType<typeof vi.fn>

  const createSpanWithIssue = async (
    traceId: string,
    createdAt?: Date,
  ): Promise<Span> => {
    const span = await createSpan({
      workspaceId: workspace.id,
      traceId,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      createdAt,
    })

    const evalResult = await createEvaluationResultV2({
      workspace,
      evaluation: hitlEvaluation,
      commit,
      span: {
        ...span,
        type: SpanType.Prompt,
      } as unknown as SpanWithDetails<SpanType.Prompt>,
      createdAt,
    })

    await createIssueEvaluationResult({
      workspace,
      issue,
      evaluationResult: evalResult,
    })

    return span
  }

  const createSpanWithoutIssue = async (
    traceId: string,
    createdAt?: Date,
  ): Promise<Span> => {
    const span = await createSpan({
      workspaceId: workspace.id,
      traceId,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      createdAt,
    })

    await createEvaluationResultV2({
      workspace,
      evaluation: hitlEvaluation,
      commit,
      span: {
        ...span,
        type: SpanType.Prompt,
      } as unknown as SpanWithDetails<SpanType.Prompt>,
      createdAt,
    })

    return span
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.restoreAllMocks()

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
    project = projectData.project

    const issueData = await factories.createIssue({
      document,
      workspace,
      project,
    })
    issue = issueData.issue

    hitlEvaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Binary,
    })

    evaluationToEvaluate = {
      uuid: 'test-eval-uuid',
      versionId: 1,
      workspaceId: workspace.id,
      commitId: commit.id,
      documentUuid: document.documentUuid,
      name: 'Test Evaluation',
      description: 'Test description',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        provider: 'openai',
        model: 'gpt-4o',
        criteria: 'Test criteria',
        passDescription: 'Pass description',
        failDescription: 'Fail description',
      },
      alignmentMetricMetadata: {
        alignmentHash: 'existing-hash',
        confusionMatrix: {
          truePositives: 0,
          trueNegatives: 0,
          falsePositives: 0,
          falseNegatives: 0,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>
  })

  it('creates recalculation flow with all spans when hasEvaluationConfigurationChanged is true', async () => {
    vi.spyOn(
      generateConfigurationHashModule,
      'generateConfigurationHash',
    ).mockReturnValue('new-hash')

    const positiveSpans = await Promise.all([
      createSpanWithIssue('trace-positive-0'),
      createSpanWithIssue('trace-positive-1'),
    ])

    const negativeSpans = await Promise.all([
      createSpanWithoutIssue('trace-negative-0'),
      createSpanWithoutIssue('trace-negative-1'),
    ])

    const result = await recalculateAlignmentMetric({
      workspace,
      commit,
      evaluationToEvaluate,
      issue,
      source: 'daily',
    })

    expect(Result.isOk(result)).toBe(true)
    const validationFlowJob = result.unwrap()
    expect(validationFlowJob.id).toBeDefined()

    expect(mockEnqueueFlow).toHaveBeenCalledTimes(1)
    const flow = mockEnqueueFlow.mock.calls[0]![0] as FlowJob
    expect(flow.data.workspaceId).toBe(workspace.id)
    expect(flow.data.commitId).toBe(commit.id)
    expect(flow.data.evaluationUuid).toBe(evaluationToEvaluate.uuid)
    expect(flow.data.documentUuid).toBe(document.documentUuid)
    expect(flow.data.hasEvaluationConfigurationChanged).toBe(true)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(2)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(2)
    expect(flow.children).toHaveLength(4)
    expect(flow.children![0]!.data.dry).toBe(true)

    const childSpanIds = flow.children!.map(
      (child: FlowChildJob) => child.data.spanId,
    )
    const allSpanIds = [
      ...positiveSpans.map((s) => s.id),
      ...negativeSpans.map((s) => s.id),
    ]
    allSpanIds.forEach((spanId) => {
      expect(childSpanIds).toContain(spanId)
    })
  })

  it('only includes spans after cutoff dates when hasEvaluationConfigurationChanged is false', async () => {
    vi.spyOn(
      generateConfigurationHashModule,
      'generateConfigurationHash',
    ).mockReturnValue('existing-hash')

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(12, 0, 0, 0)

    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    evaluationToEvaluate.alignmentMetricMetadata = {
      alignmentHash: 'existing-hash',
      confusionMatrix: {
        truePositives: 0,
        trueNegatives: 0,
        falsePositives: 0,
        falseNegatives: 0,
      },
      lastProcessedPositiveSpanDate: twoDaysAgo.toISOString(),
      lastProcessedNegativeSpanDate: twoDaysAgo.toISOString(),
    }

    const oldPositiveSpans = await Promise.all([
      createSpanWithIssue('trace-old-positive-0', threeDaysAgo),
      createSpanWithIssue('trace-old-positive-1', threeDaysAgo),
    ])

    const recentPositiveSpans = await Promise.all([
      createSpanWithIssue('trace-recent-positive-0', yesterday),
      createSpanWithIssue('trace-recent-positive-1', yesterday),
    ])

    const oldNegativeSpans = await Promise.all([
      createSpanWithoutIssue('trace-old-negative-0', threeDaysAgo),
      createSpanWithoutIssue('trace-old-negative-1', threeDaysAgo),
    ])

    const recentNegativeSpans = await Promise.all([
      createSpanWithoutIssue('trace-recent-negative-0', yesterday),
      createSpanWithoutIssue('trace-recent-negative-1', yesterday),
    ])

    const result = await recalculateAlignmentMetric({
      workspace,
      commit,
      evaluationToEvaluate,
      issue,
      source: 'daily',
    })

    expect(Result.isOk(result)).toBe(true)
    const validationFlowJob = result.unwrap()
    expect(validationFlowJob.id).toBeDefined()

    expect(mockEnqueueFlow).toHaveBeenCalledTimes(1)
    const flow = mockEnqueueFlow.mock.calls[0]![0] as FlowJob
    expect(flow.data.hasEvaluationConfigurationChanged).toBe(false)

    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(2)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(2)
    expect(flow.children).toHaveLength(4)

    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation[0]
        .createdAt,
    ).toBeDefined()
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation[0]
        .createdAt,
    ).toBeDefined()

    const childSpanIds = flow.children!.map(
      (child: FlowChildJob) => child.data.spanId,
    )
    const recentSpanIds = [
      ...recentPositiveSpans.map((s) => s.id),
      ...recentNegativeSpans.map((s) => s.id),
    ]
    const oldSpanIds = [
      ...oldPositiveSpans.map((s) => s.id),
      ...oldNegativeSpans.map((s) => s.id),
    ]

    recentSpanIds.forEach((spanId) => {
      expect(childSpanIds).toContain(spanId)
    })

    oldSpanIds.forEach((spanId) => {
      expect(childSpanIds).not.toContain(spanId)
    })
  })

  it('re-balances spans when filtering results in unequal amounts', async () => {
    vi.spyOn(
      generateConfigurationHashModule,
      'generateConfigurationHash',
    ).mockReturnValue('existing-hash')

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(12, 0, 0, 0)

    await Promise.all([
      createSpanWithIssue('trace-recent-positive-0', yesterday),
      createSpanWithIssue('trace-recent-positive-1', yesterday),
      createSpanWithIssue('trace-recent-positive-2', yesterday),
    ])

    await createSpanWithoutIssue('trace-recent-negative-0', yesterday)

    const result = await recalculateAlignmentMetric({
      workspace,
      commit,
      evaluationToEvaluate,
      issue,
      source: 'daily',
    })

    expect(Result.isOk(result)).toBe(true)

    const flow = mockEnqueueFlow.mock.calls[0]![0] as FlowJob

    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(1)
    expect(
      flow.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(1)
    expect(flow.children).toHaveLength(2)
  })

  it('returns error when getEqualAmountsOfPositiveAndNegativeExamples fails', async () => {
    const getEqualAmountsModule = await import(
      './getEqualAmountsOfPositiveAndNegativeExamples'
    )
    vi.spyOn(
      getEqualAmountsModule,
      'getEqualAmountsOfPositiveAndNegativeExamples',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).mockResolvedValue(
      Result.error(new Error('Failed to get examples from database')) as any,
    )

    const result = await recalculateAlignmentMetric({
      workspace,
      commit,
      evaluationToEvaluate,
      issue,
      source: 'daily',
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error?.message).toBe('Failed to get examples from database')
  })
})
