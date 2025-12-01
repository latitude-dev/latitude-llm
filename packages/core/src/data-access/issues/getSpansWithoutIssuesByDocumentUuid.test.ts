import { beforeEach, describe, expect, it } from 'vitest'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'
import {
  createCommit,
  createEvaluationResultV2,
  createEvaluationV2,
  createIssue,
  createIssueEvaluationResult,
  createProject,
  createSpan,
} from '../../tests/factories'
import { getSpansWithoutIssuesByDocumentUuid } from './getSpansWithoutIssuesByDocumentUuid'
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

describe('getSpansWithoutIssuesByDocumentUuid', () => {
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
      // Create span for workspace 1
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
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

      await createSpan({
        workspaceId: workspace2.id,
        traceId: 'trace-2',
        documentUuid: document2.documentUuid,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
      })

      // Query for spans in workspace 1
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
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

      // Query with commit2 - should include commit1 and commit2 but not commit3
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit: commit2,
        documentUuid: document.documentUuid,
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

      const spanDraft = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-draft',
        documentUuid: document.documentUuid,
        commitUuid: draftCommit.uuid,
        type: SpanType.Prompt,
      })

      // Query with draft commit - should include draft and all merged commits
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit: draftCommit,
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
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

      // Create spans
      await createSpan({
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

      // Soft delete commit1
      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, commit1.id))

      // Query should only return span from commit2
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit: commit2,
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span2.id)
    })
  })

  describe('issue exclusion', () => {
    it('excludes spans that have evaluation results linked to issues', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
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
        evaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      // Associate span1 with issue (should be excluded)
      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      // span2 is not associated with any issue (should be included)

      // Query should only return span2
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span2.id)
    })

    it('excludes spans linked to any issue, not just the specified one', async () => {
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
        evaluation,
        commit,
        span: {
          ...span1,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation,
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

      // Query should return no spans (both are linked to issues)
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
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

      // Create spans in different documents
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document2.documentUuid,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
      })

      // Query for document1 should only return span1
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
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
      // Create multiple spans
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
      }

      // Query first page with pageSize 2
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 2,
      })

      expect(result.ok).toBe(true)
      const { spans: resultSpans, hasNextPage } = result.unwrap()
      expect(resultSpans).toHaveLength(2)
      expect(hasNextPage).toBe(true)
    })

    it('returns hasNextPage correctly', async () => {
      // Create exactly pageSize spans
      const pageSize = 3
      for (let i = 0; i < pageSize; i++) {
        await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
        })
      }

      // Query should return all spans and hasNextPage should be false
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        page: 1,
        pageSize,
      })

      expect(result.ok).toBe(true)
      const { spans: resultSpans, hasNextPage } = result.unwrap()
      expect(resultSpans).toHaveLength(pageSize)
      expect(hasNextPage).toBe(false)
    })

    it('returns empty array when no spans exist', async () => {
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 10,
      })

      expect(result.ok).toBe(true)
      const { spans: resultSpans, hasNextPage } = result.unwrap()
      expect(resultSpans).toHaveLength(0)
      expect(hasNextPage).toBe(false)
    })
  })

  describe('span type filtering', () => {
    it('only returns Prompt spans', async () => {
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

      // Query should only return Prompt span
      const result = await getSpansWithoutIssuesByDocumentUuid({
        workspace,
        commit,
        documentUuid: document.documentUuid,
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
