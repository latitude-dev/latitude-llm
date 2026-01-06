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
  createProject,
  createSpan,
} from '../../tests/factories'
import { getHITLSpansByDocument } from './getHITLSpansByDocument'
import { database } from '../../client'
import { commits } from '../../schema/models/commits'
import { eq } from 'drizzle-orm'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { User } from '../../schema/models/types/User'
import type { Commit } from '../../schema/models/types/Commit'
import type { Project } from '../../schema/models/types/Project'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { createWorkspace } from '../../tests/factories/workspaces'

describe('getHITLSpansByDocument', () => {
  let workspace: Workspace
  let workspace2: Workspace
  let user: User
  let project: Project
  let commit: Commit
  let document: DocumentVersion
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
  })

  describe('HITL evaluation filtering', () => {
    it('only returns spans that have HITL evaluation results', async () => {
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
      await createEvaluationResultV2({
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

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query should only return span1 (has HITL evaluation result)
      const result = await getHITLSpansByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
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
      // Create HITL evaluation
      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create span for workspace 1
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Create span for workspace 2
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

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query for spans in workspace 1
      const result = await getHITLSpansByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
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
      const now = new Date()

      const commit1 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(now.getTime() + 1000),
      })

      const commit2 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(now.getTime() + 2000),
      })

      const commit3 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(now.getTime() + 3000),
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

      // Create HITL evaluation results
      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit3,
        span: {
          ...span3,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query with commit2 - should include commit1 and commit2 but not commit3
      const result = await getHITLSpansByDocument({
        workspace,
        commit: commit2,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
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
      const now = new Date()

      const commit1 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(now.getTime() + 1000),
      })

      const commit2 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(now.getTime() + 2000),
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

      // Create HITL evaluation results
      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Soft delete commit1
      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, commit1.id))

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query should only return span from commit2
      const result = await getHITLSpansByDocument({
        workspace,
        commit: commit2,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span2.id)
    })
  })

  describe('document filtering', () => {
    it('only returns spans for the specified document', async () => {
      // Create a second document
      const project2Setup = await createProject({
        workspace,
        documents: {
          'test-doc-2': 'Test content 2',
        },
      })
      const document2 = project2Setup.documents[0]!
      const commit2 = project2Setup.commit

      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const hitlEvaluation2 = await createEvaluationV2({
        workspace,
        document: document2,
        commit: commit2,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create spans in different documents
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
        documentUuid: document2.documentUuid,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
      })

      // Create HITL evaluation results
      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation2,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query for document1 should only return span1
      const result = await getHITLSpansByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
    })
  })

  describe('pagination', () => {
    it('returns correct page size', async () => {
      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create multiple spans with HITL evaluation results
      const spans = []
      for (let i = 0; i < 5; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
        })
        spans.push(span)

        await createEvaluationResultV2({
          workspace,
          evaluation: hitlEvaluation,
          commit,
          span: {
            ...span,
            type: SpanType.Prompt,
          } as unknown as SpanWithDetails<SpanType.Prompt>,
        })
      }

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query first page with pageSize 2
      const result = await getHITLSpansByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 1,
        pageSize: 2,
      })

      expect(result.ok).toBe(true)
      const { spans: resultSpans, hasNextPage } = result.unwrap()
      expect(resultSpans).toHaveLength(2)
      expect(hasNextPage).toBe(true)
    })

    it('returns hasNextPage correctly', async () => {
      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create exactly pageSize spans with HITL evaluation results
      const pageSize = 3
      for (let i = 0; i < pageSize; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
        })

        await createEvaluationResultV2({
          workspace,
          evaluation: hitlEvaluation,
          commit,
          span: {
            ...span,
            type: SpanType.Prompt,
          } as unknown as SpanWithDetails<SpanType.Prompt>,
        })
      }

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query should return all spans and hasNextPage should be false
      const result = await getHITLSpansByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 1,
        pageSize,
      })

      expect(result.ok).toBe(true)
      const { spans: resultSpans, hasNextPage } = result.unwrap()
      expect(resultSpans).toHaveLength(pageSize)
      expect(hasNextPage).toBe(false)
    })
  })

  describe('span type filtering', () => {
    it('only returns Prompt spans', async () => {
      const hitlEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      // Create spans of different types
      const promptSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-prompt',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-tool',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Tool,
      })

      // Create HITL evaluation result only for prompt span
      await createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Create a dummy issue to exclude
      const { issue: dummyIssue } = await createIssue({
        workspace,
        project,
        document,
      })

      // Query should only return Prompt span
      const result = await getHITLSpansByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(promptSpan.id)
      expect(spans[0]!.type).toBe(SpanType.Prompt)
    })
  })
})
