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
import { FlowProducer } from 'bullmq'
import { buildRedisConnection } from '../../../redis'
import { recalculateAlignmentMetric } from './recalculateAlignmentMetric'
import * as generateConfigurationHashModule from '../generateConfigurationHash'

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
  let mockFlowProducer: any
  let mockRedisConnection: any

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

    mockRedisConnection = {}
    vi.mocked(buildRedisConnection).mockResolvedValue(mockRedisConnection)

    mockFlowProducer = {
      add: vi.fn().mockResolvedValue({
        job: { id: TEST_JOB_ID },
      }),
    }
    vi.mocked(FlowProducer).mockImplementation(() => mockFlowProducer)
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
    })

    expect(Result.isOk(result)).toBe(true)
    const validationFlowJob = result.unwrap()
    expect(validationFlowJob.id).toBe(TEST_JOB_ID)

    expect(mockFlowProducer.add).toHaveBeenCalledTimes(1)
    const callArgs = mockFlowProducer.add.mock.calls[0]![0]
    expect(callArgs.data.workspaceId).toBe(workspace.id)
    expect(callArgs.data.commitId).toBe(commit.id)
    expect(callArgs.data.evaluationUuid).toBe(evaluationToEvaluate.uuid)
    expect(callArgs.data.documentUuid).toBe(document.documentUuid)
    expect(callArgs.data.hasEvaluationConfigurationChanged).toBe(true)
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(2)
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(2)
    expect(callArgs.children).toHaveLength(4)
    expect(callArgs.children[0]!.data.dry).toBe(true)

    const childSpanIds = callArgs.children.map(
      (child: { data: { spanId: string } }) => child.data.spanId,
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

    // Set cutoffs in evaluationToEvaluate to 2 days ago
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
    })

    expect(Result.isOk(result)).toBe(true)
    const validationFlowJob = result.unwrap()
    expect(validationFlowJob.id).toBe(TEST_JOB_ID)

    expect(mockFlowProducer.add).toHaveBeenCalledTimes(1)
    const callArgs = mockFlowProducer.add.mock.calls[0]![0]
    expect(callArgs.data.hasEvaluationConfigurationChanged).toBe(false)

    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(2)
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(2)
    expect(callArgs.children).toHaveLength(4)

    // Verify span/trace pairs include createdAt for rebalancing
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation[0]
        .createdAt,
    ).toBeDefined()
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation[0]
        .createdAt,
    ).toBeDefined()

    const childSpanIds = callArgs.children.map(
      (child: { data: { spanId: string } }) => child.data.spanId,
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
    })

    expect(Result.isOk(result)).toBe(true)

    const callArgs = mockFlowProducer.add.mock.calls[0]![0]

    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    ).toHaveLength(1)
    expect(
      callArgs.data.spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    ).toHaveLength(1)
    expect(callArgs.children).toHaveLength(2)
  })

  it('returns error when FlowProducer fails to create job with empty id', async () => {
    mockFlowProducer.add.mockResolvedValue({
      job: { id: undefined },
    })

    const result = await recalculateAlignmentMetric({
      workspace,
      commit,
      evaluationToEvaluate,
      issue,
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error?.message).toBe(
      'Failed to create evaluation validation flow',
    )
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
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error?.message).toBe('Failed to get examples from database')
  })
})
