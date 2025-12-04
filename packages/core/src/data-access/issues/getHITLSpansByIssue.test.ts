import { beforeEach, describe, expect, it } from 'vitest'
import {
  SpanType,
  EvaluationType,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  SpanWithDetails,
} from '@latitude-data/constants'
import {
  createCommit,
  createEvaluationResultV2,
  createEvaluationV2,
  createIssue,
  createIssueEvaluationResult,
  createProject,
  createSpan,
} from '../../tests/factories'
import { getHITLSpansByIssue } from './getHITLSpansByIssue'
import { database } from '../../client'
import { commits } from '../../schema/models/commits'
import { eq } from 'drizzle-orm'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { User } from '../../schema/models/types/User'
import type { Commit } from '../../schema/models/types/Commit'
import type { Project } from '../../schema/models/types/Project'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Issue } from '../../schema/models/types/Issue'
import { createWorkspace } from '../../tests/factories/workspaces'

describe('getHITLSpansByIssue', () => {
  let workspace: Workspace
  let workspace2: Workspace
  let user: User
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let issue: Issue
  let providerName: string

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = setup.workspace
    user = setup.user
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!
    providerName = setup.providers[0]!.name

    // Create a second workspace for tenant isolation tests
    const workspace2Setup = await createWorkspace()
    workspace2 = workspace2Setup.workspace

    // Create an issue
    const issueSetup = await createIssue({
      workspace,
      project,
      document,
    })
    issue = issueSetup.issue
  })

  describe('HITL evaluation filtering', () => {
    it('only returns spans from HITL evaluations', async () => {
      // Create HITL evaluation
      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create LLM evaluation
      const llmEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          provider: providerName,
          model: 'gpt-4o',
          criteria: 'Test criteria',
          passDescription: 'Passes',
          failDescription: 'Fails',
        },
      })

      // Create spans
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create HITL evaluation result for span1
      const hitlEvalResult = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Create LLM evaluation result for span2
      await createEvaluationResultV2({
        workspace,
        evaluation: llmEvaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Associate both with issue
      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: hitlEvalResult,
      })

      // Query should only return span1 (from HITL evaluation)
      const result = await getHITLSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
    })
  })

  describe('tenant isolation', () => {
    it('only returns spans from the correct workspace', async () => {
      // Create HITL evaluation and span for workspace 1
      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      // Create HITL evaluation and span for workspace 2
      const project2Setup = await createProject({
        workspace: workspace2,
        documents: {
          'test-doc-2': 'Test content 2',
        },
      })

      const document2 = project2Setup.documents[0]!
      const commit2 = project2Setup.commit

      const hitlEvaluation2 = await createEvaluationV2({
        workspace: workspace2,
        document: document2,
        commit: commit2,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span2 = await createSpan({
        workspaceId: workspace2.id,
        traceId: 'trace-2',
        documentUuid: document2.documentUuid,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace: workspace2,
        evaluation: hitlEvaluation2,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Query for spans in workspace 1
      const result = await getHITLSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
      expect(spans[0]!.workspaceId).toBe(workspace.id)
    })
  })

  describe('commit history filtering', () => {
    it('returns spans from commits in the history', async () => {
      // Create first merged commit
      const commit1 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-01'),
      })

      // Create second merged commit (more recent)
      const commit2 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-02'),
      })

      // Create third merged commit (most recent)
      const commit3 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-03'),
      })

      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create spans in different commits
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
      })

      const span3 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentUuid: document.documentUuid,
        commitUuid: commit3.uuid,
        type: SpanType.Prompt,
      })

      // Create evaluation results for each commit
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      const evalResult3 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit3,
        span: {
          ...span3,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Associate all evaluation results with the issue
      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult2,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult3,
      })

      // Query with commit2 - should include commit1 and commit2 but not commit3
      const result = await getHITLSpansByIssue({
        workspace,
        commit: commit2,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(2)

      const spanIds = spans.map((s) => s.id)
      expect(spanIds).toContain(span1.id)
      expect(spanIds).toContain(span2.id)
      expect(spanIds).not.toContain(span3.id)
    })
  })

  describe('deleted commits filtering', () => {
    it('excludes spans from deleted commits', async () => {
      const commit1 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-01'),
      })

      const commit2 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-02'),
      })

      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create spans
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
      })

      // Create evaluation results
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Associate with issue
      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult2,
      })

      // Soft delete commit1
      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, commit1.id))

      // Query should only return span from commit2
      const result = await getHITLSpansByIssue({
        workspace,
        commit: commit2,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span2.id)
    })
  })

  describe('issue filtering', () => {
    it('only returns spans for the specified issue', async () => {
      // Create a second issue
      const issue2Setup = await createIssue({
        workspace,
        project,
        document,
      })
      const issue2 = issue2Setup.issue

      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create spans
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      // Create evaluation results
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Associate span1 with issue1
      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      // Associate span2 with issue2
      await createIssueEvaluationResult({
        workspace,
        issue: issue2,
        evaluationResult: evalResult2,
      })

      // Query for issue1 should only return span1
      const result1 = await getHITLSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result1.ok).toBe(true)
      const { spans: spans1 } = result1.unwrap()
      expect(spans1).toHaveLength(1)
      expect(spans1[0]!.id).toBe(span1.id)

      // Query for issue2 should only return span2
      const result2 = await getHITLSpansByIssue({
        workspace,
        commit,
        issue: issue2,
        page: 1,
        pageSize: 10,
      })

      expect(result2.ok).toBe(true)
      const { spans: spans2 } = result2.unwrap()
      expect(spans2).toHaveLength(1)
      expect(spans2[0]!.id).toBe(span2.id)
    })
  })

  describe('pagination', () => {
    it('returns correct page of results', async () => {
      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create 5 spans with evaluation results
      const spanIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
        })
        spanIds.push(span.id)

        const evalResult = await createEvaluationResultV2({
          workspace,
          evaluation: hitlEvaluation,
          commit,
          span: {
            ...span,
            type: SpanType.Prompt,
          } as unknown as SpanWithDetails<SpanType.Prompt>,
          createdAt: new Date(Date.now() + i * 1000), // Ensure different timestamps
        })

        await createIssueEvaluationResult({
          workspace,
          issue,
          evaluationResult: evalResult,
        })
      }

      // Page 1 with pageSize 2
      const result1 = await getHITLSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 2,
      })

      expect(result1.ok).toBe(true)
      const { spans: spans1, hasNextPage: hasNextPage1 } = result1.unwrap()
      expect(spans1).toHaveLength(2)
      expect(hasNextPage1).toBe(true)

      // Page 2 with pageSize 2
      const result2 = await getHITLSpansByIssue({
        workspace,
        commit,
        issue,
        page: 2,
        pageSize: 2,
      })

      expect(result2.ok).toBe(true)
      const { spans: spans2, hasNextPage: hasNextPage2 } = result2.unwrap()
      expect(spans2).toHaveLength(2)
      expect(hasNextPage2).toBe(true)

      // Page 3 with pageSize 2 (last page with 1 item)
      const result3 = await getHITLSpansByIssue({
        workspace,
        commit,
        issue,
        page: 3,
        pageSize: 2,
      })

      expect(result3.ok).toBe(true)
      const { spans: spans3, hasNextPage: hasNextPage3 } = result3.unwrap()
      expect(spans3).toHaveLength(1)
      expect(hasNextPage3).toBe(false)
    })
  })
})
