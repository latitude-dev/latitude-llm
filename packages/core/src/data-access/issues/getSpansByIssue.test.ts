import { beforeEach, describe, expect, it } from 'vitest'
import { SpanType } from '@latitude-data/constants'
import {
  createCommit,
  createEvaluationResultV2,
  createEvaluationV2,
  createIssue,
  createIssueEvaluationResult,
  createProject,
  createSpan,
} from '../../tests/factories'
import { getSpansByIssue } from './getSpansByIssue'
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

describe('getSpansByIssue', () => {
  let workspace: Workspace
  let workspace2: Workspace
  let user: User
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let issue: Issue

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

  describe('tenant isolation', () => {
    it('only returns spans from the correct workspace', async () => {
      // Create evaluation and span for workspace 1
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
      })

      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      // Create evaluation and span for workspace 2
      const project2Setup = await createProject({
        workspace: workspace2,
        documents: {
          'test-doc-2': 'Test content 2',
        },
      })

      const document2 = project2Setup.documents[0]!
      const commit2 = project2Setup.commit

      const evaluation2 = await createEvaluationV2({
        workspace: workspace2,
        document: document2,
        commit: commit2,
      })

      const span2 = await createSpan({
        workspaceId: workspace2.id,
        traceId: 'trace-2',
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace: workspace2,
        evaluation: evaluation2,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
      })

      // Try to associate workspace2's evaluation result with workspace1's issue
      // This should be prevented by the query's workspace filter
      await createIssueEvaluationResult({
        workspace: workspace2,
        issue,
        evaluationResult: evalResult2,
      })

      // Query for spans in workspace 1
      const result = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.value
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

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create spans in different commits
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
      })

      const span3 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
      })

      // Create evaluation results for each commit
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
      })

      const evalResult3 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit3,
        span: {
          ...span3,
          type: SpanType.Prompt,
        } as any,
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
      const result = await getSpansByIssue({
        workspace,
        commit: commit2,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.value
      expect(spans).toHaveLength(2)

      const spanIds = spans.map((s) => s.id)
      expect(spanIds).toContain(span1.id)
      expect(spanIds).toContain(span2.id)
      expect(spanIds).not.toContain(span3.id)
    })

    it('includes draft commit and all previous merged commits', async () => {
      // Create merged commits
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

      // Create draft commit (mergedAt = null)
      const draftCommit = await createCommit({
        projectId: project.id,
        user,
        mergedAt: null,
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create spans in different commits
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
      })

      const spanDraft = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-draft',
      })

      // Create evaluation results
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
      })

      const evalResultDraft = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: draftCommit,
        span: {
          ...spanDraft,
          type: SpanType.Prompt,
        } as any,
      })

      // Associate all with issue
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
        evaluationResult: evalResultDraft,
      })

      // Query with draft commit - should include draft and all merged commits
      const result = await getSpansByIssue({
        workspace,
        commit: draftCommit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.value
      expect(spans).toHaveLength(3)

      const spanIds = spans.map((s) => s.id)
      expect(spanIds).toContain(span1.id)
      expect(spanIds).toContain(span2.id)
      expect(spanIds).toContain(spanDraft.id)
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

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create spans
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
      })

      // Create evaluation results
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit2,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
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
      const result = await getSpansByIssue({
        workspace,
        commit: commit2,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.value
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

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create spans
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
      })

      // Create evaluation results
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
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
      const result1 = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result1.ok).toBe(true)
      const { spans: spans1 } = result1.value
      expect(spans1).toHaveLength(1)
      expect(spans1[0]!.id).toBe(span1.id)

      // Query for issue2 should only return span2
      const result2 = await getSpansByIssue({
        workspace,
        commit,
        issue: issue2,
        page: 1,
        pageSize: 10,
      })

      expect(result2.ok).toBe(true)
      const { spans: spans2 } = result2.value
      expect(spans2).toHaveLength(1)
      expect(spans2[0]!.id).toBe(span2.id)
    })
  })

  describe('evaluated span filtering', () => {
    it('only includes evaluation results with evaluatedSpanId and evaluatedTraceId', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create two different spans
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        id: 'span-1',
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        id: 'span-2',
      })

      // Create evaluation result with span references
      const evalResultWithSpan = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
      })

      // Create evaluation result with span references (different span)
      const evalResultWithSpan2 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
      })

      // Manually set evaluatedSpanId to null to simulate missing span reference
      await database.execute(`
        UPDATE evaluation_results_v2
        SET evaluated_span_id = NULL, evaluated_trace_id = NULL
        WHERE id = ${evalResultWithSpan2.id}
      `)

      // Associate both with issue
      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResultWithSpan,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResultWithSpan2,
      })

      // Query should only return the span from the result with span references
      const result = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.value
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
    })
  })

  describe('pagination', () => {
    it('returns correct page of results', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create 5 spans with evaluation results
      const spanIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
        })
        spanIds.push(span.id)

        const evalResult = await createEvaluationResultV2({
          workspace,
          evaluation,
          commit,
          span: {
            ...span,
            type: SpanType.Prompt,
          } as any,
          createdAt: new Date(Date.now() + i * 1000), // Ensure different timestamps
        })

        await createIssueEvaluationResult({
          workspace,
          issue,
          evaluationResult: evalResult,
        })
      }

      // Page 1 with pageSize 2
      const result1 = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 2,
      })

      expect(result1.ok).toBe(true)
      expect(result1.value.spans).toHaveLength(2)
      expect(result1.value.hasNextPage).toBe(true)

      // Page 2 with pageSize 2
      const result2 = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 2,
        pageSize: 2,
      })

      expect(result2.ok).toBe(true)
      expect(result2.value.spans).toHaveLength(2)
      expect(result2.value.hasNextPage).toBe(true)

      // Page 3 with pageSize 2 (last page with 1 item)
      const result3 = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 3,
        pageSize: 2,
      })

      expect(result3.ok).toBe(true)
      expect(result3.value.spans).toHaveLength(1)
      expect(result3.value.hasNextPage).toBe(false)
    })

    it('returns empty array when page is beyond available data', async () => {
      const result = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 10,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      expect(result.value.spans).toHaveLength(0)
      expect(result.value.hasNextPage).toBe(false)
    })
  })

  describe('ordering', () => {
    it('returns spans ordered by evaluation result creation date descending', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create spans with different creation timestamps
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
      })

      const span3 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
      })

      // Create evaluation results with specific timestamps
      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
        createdAt: new Date('2024-01-01'),
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
        createdAt: new Date('2024-01-03'),
      })

      const evalResult3 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span3,
          type: SpanType.Prompt,
        } as any,
        createdAt: new Date('2024-01-02'),
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

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult3,
      })

      // Query should return spans ordered by evaluation result creation date (desc)
      const result = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.value
      expect(spans).toHaveLength(3)

      // Should be ordered: span2 (2024-01-03), span3 (2024-01-02), span1 (2024-01-01)
      expect(spans[0]!.id).toBe(span2.id)
      expect(spans[1]!.id).toBe(span3.id)
      expect(spans[2]!.id).toBe(span1.id)
    })
  })

  describe('complex scenarios', () => {
    it('handles all filters together correctly', async () => {
      // Create another workspace
      const workspace3Setup = await createWorkspace()
      const workspace3 = workspace3Setup.workspace

      // Create commits with history
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

      const commit3 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-03'),
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      // Create another issue for the same workspace
      const issue2Setup = await createIssue({
        workspace,
        project,
        document,
      })
      const issue2 = issue2Setup.issue

      // Span 1: correct workspace, in history (commit1), not deleted, correct issue
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
      })

      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit1,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as any,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      // Span 2: wrong workspace
      const span2 = await createSpan({
        workspaceId: workspace3.id,
        traceId: 'trace-2',
      })

      const project3Setup = await createProject({
        workspace: workspace3,
        documents: {
          'test-doc-3': 'Test content 3',
        },
      })

      const evaluation3 = await createEvaluationV2({
        workspace: workspace3,
        document: project3Setup.documents[0]!,
        commit: project3Setup.commit,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace: workspace3,
        evaluation: evaluation3,
        commit: project3Setup.commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
      })

      await createIssueEvaluationResult({
        workspace: workspace3,
        issue,
        evaluationResult: evalResult2,
      })

      // Span 3: correct workspace, not in history (commit3), correct issue
      const span3 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
      })

      const evalResult3 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit3,
        span: {
          ...span3,
          type: SpanType.Prompt,
        } as any,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult3,
      })

      // Span 4: correct workspace, in history (commit1), but deleted commit
      const span4 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-4',
      })

      const deletedCommit = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-01T12:00:00'),
      })

      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, deletedCommit.id))

      const evalResult4 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: deletedCommit,
        span: {
          ...span4,
          type: SpanType.Prompt,
        } as any,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult4,
      })

      // Span 5: correct workspace, in history, not deleted, but wrong issue
      const span5 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-5',
      })

      const evalResult5 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit1,
        span: {
          ...span5,
          type: SpanType.Prompt,
        } as any,
      })

      await createIssueEvaluationResult({
        workspace,
        issue: issue2,
        evaluationResult: evalResult5,
      })

      // Query with commit2 - only span1 should be returned
      const result = await getSpansByIssue({
        workspace,
        commit: commit2,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.value
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
    })
  })
})
