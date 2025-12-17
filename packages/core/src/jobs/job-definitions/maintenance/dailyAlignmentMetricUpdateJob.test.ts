import { Job } from 'bullmq'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  EvaluationType,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  Providers,
  RuleEvaluationMetric,
  SpanType,
} from '@latitude-data/constants'
import * as factories from '../../../tests/factories'
import { dailyAlignmentMetricUpdateJob } from './dailyAlignmentMetricUpdateJob'
import type { Workspace } from '../../../schema/models/types/Workspace'
import type { Commit } from '../../../schema/models/types/Commit'
import type { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import type { Issue } from '../../../schema/models/types/Issue'
import type { EvaluationV2 } from '../../../constants'
import type { Project } from '../../../schema/models/types/Project'
import { database } from '../../../client'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'
import { eq } from 'drizzle-orm'
import {
  createEvaluationResultV2,
  createEvaluationV2,
  createIssueEvaluationResult,
  createSpan,
} from '../../../tests/factories'
import { SpanWithDetails } from '@latitude-data/constants'

const mockMaintenanceQueueAdd = vi.fn()

vi.mock('../../queues', () => ({
  queues: () =>
    Promise.resolve({
      maintenanceQueue: {
        add: mockMaintenanceQueueAdd,
      },
    }),
}))

const PROVIDER_NAME = 'test-openai'

const getLlmBinaryConfiguration = (criteria: string) => ({
  reverseScale: false,
  actualOutput: {
    messageSelection: 'last' as const,
    parsingFormat: 'string' as const,
  },
  expectedOutput: {
    parsingFormat: 'string' as const,
  },
  provider: PROVIDER_NAME,
  model: 'gpt-4o',
  criteria,
  passDescription: 'Pass',
  failDescription: 'Fail',
})

describe('dailyAlignmentMetricUpdateJob', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let project: Project
  let issue: Issue
  let hitlEvaluation: EvaluationV2

  const linkEvaluationToIssue = async (
    evaluation: EvaluationV2,
    issueToLink: Issue,
  ) => {
    await database
      .update(evaluationVersions)
      .set({ issueId: issueToLink.id })
      .where(eq(evaluationVersions.id, evaluation.versionId))
  }

  const createSpanWithHITLResult = async (
    doc: DocumentVersion,
    com: Commit,
    ws: Workspace,
    hitlEval: EvaluationV2,
    iss: Issue,
    traceId: string,
  ) => {
    const span = await createSpan({
      workspaceId: ws.id,
      traceId,
      documentUuid: doc.documentUuid,
      commitUuid: com.uuid,
      type: SpanType.Prompt,
    })

    const evalResult = await createEvaluationResultV2({
      workspace: ws,
      evaluation: hitlEval,
      commit: com,
      span: {
        ...span,
        type: SpanType.Prompt,
      } as unknown as SpanWithDetails<SpanType.Prompt>,
    })

    await createIssueEvaluationResult({
      workspace: ws,
      issue: iss,
      evaluationResult: evalResult,
    })

    return span
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const projectData = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: PROVIDER_NAME }],
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
  })

  it('does nothing when there are no evaluations with issues', async () => {
    const mockJob = {} as Job

    await dailyAlignmentMetricUpdateJob(mockJob)

    expect(mockMaintenanceQueueAdd).not.toHaveBeenCalled()
  })

  it('queues update for LLM Binary evaluation with issue when there are unprocessed spans', async () => {
    const ruleEvalWithIssue = await createEvaluationV2({
      workspace,
      document,
      commit,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.ExactMatch,
    })
    await linkEvaluationToIssue(ruleEvalWithIssue, issue)

    const llmBinaryEvalWithIssue = await createEvaluationV2({
      workspace,
      document,
      commit,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: getLlmBinaryConfiguration('Test criteria'),
    })
    await linkEvaluationToIssue(llmBinaryEvalWithIssue, issue)

    const llmBinaryEvalWithoutIssue = await createEvaluationV2({
      workspace,
      document,
      commit,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: getLlmBinaryConfiguration('Another criteria'),
    })

    // Create HITL span linked to issue (unprocessed negative span)
    await createSpanWithHITLResult(
      document,
      commit,
      workspace,
      hitlEvaluation,
      issue,
      'trace-1',
    )

    const mockJob = {} as Job

    await dailyAlignmentMetricUpdateJob(mockJob)

    // Should only queue LLM Binary evaluations with issues that have unprocessed spans
    expect(mockMaintenanceQueueAdd).toHaveBeenCalledTimes(1)
    expect(mockMaintenanceQueueAdd).toHaveBeenCalledWith(
      'updateEvaluationAlignmentJob',
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationUuid: llmBinaryEvalWithIssue.uuid,
        issueId: issue.id,
      }),
      { attempts: 1 },
    )

    const calledEvaluationUuids = mockMaintenanceQueueAdd.mock.calls.map(
      (call) => call[1].evaluationUuid,
    )
    expect(calledEvaluationUuids).toContain(llmBinaryEvalWithIssue.uuid)
    expect(calledEvaluationUuids).not.toContain(ruleEvalWithIssue.uuid)
    expect(calledEvaluationUuids).not.toContain(llmBinaryEvalWithoutIssue.uuid)
  })

  it('does not queue evaluation when there are no unprocessed spans', async () => {
    const llmBinaryEvalWithIssue = await createEvaluationV2({
      workspace,
      document,
      commit,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: getLlmBinaryConfiguration('Test criteria'),
    })
    await linkEvaluationToIssue(llmBinaryEvalWithIssue, issue)

    // No HITL spans created - nothing to process

    const mockJob = {} as Job

    await dailyAlignmentMetricUpdateJob(mockJob)

    // Should not queue because there are no unprocessed spans
    expect(mockMaintenanceQueueAdd).not.toHaveBeenCalled()
  })

  it('only queues evaluations that have unprocessed spans', async () => {
    const projectData2 = await factories.createProject({
      workspace,
      documents: {
        'test-doc-2': 'Test content 2',
      },
    })
    const document2 = projectData2.documents[0]!
    const commit2 = projectData2.commit
    const project2 = projectData2.project

    const issueData2 = await factories.createIssue({
      document: document2,
      workspace,
      project: project2,
    })
    const issue2 = issueData2.issue

    const evalDoc1 = await createEvaluationV2({
      workspace,
      document,
      commit,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: getLlmBinaryConfiguration('Criteria for doc 1'),
    })
    await linkEvaluationToIssue(evalDoc1, issue)

    const evalDoc2 = await createEvaluationV2({
      workspace,
      document: document2,
      commit: commit2,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: getLlmBinaryConfiguration('Criteria for doc 2'),
    })
    await linkEvaluationToIssue(evalDoc2, issue2)

    // Create unprocessed span for doc1 only
    await createSpanWithHITLResult(
      document,
      commit,
      workspace,
      hitlEvaluation,
      issue,
      'trace-doc1',
    )

    // No spans for doc2 - should not be queued

    const mockJob = {} as Job

    await dailyAlignmentMetricUpdateJob(mockJob)

    // Should only queue evalDoc1 because it has unprocessed spans
    expect(mockMaintenanceQueueAdd).toHaveBeenCalledTimes(1)

    const calledEvaluationUuids = mockMaintenanceQueueAdd.mock.calls.map(
      (call) => call[1].evaluationUuid,
    )
    expect(calledEvaluationUuids).toContain(evalDoc1.uuid)
    expect(calledEvaluationUuids).not.toContain(evalDoc2.uuid)
  })
})
