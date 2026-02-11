import {
  EvaluationType,
  HumanEvaluationBinaryConfiguration,
  HumanEvaluationMetric,
  LogSources,
  SpanStatus,
  SpanType,
} from '@latitude-data/constants'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { database } from '../../client'
import { commits } from '../../schema/models/commits'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { issues as issuesTable } from '../../schema/models/issues'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Issue } from '../../schema/models/types/Issue'
import type { Project } from '../../schema/models/types/Project'
import type { User } from '../../schema/models/types/User'
import type { Workspace } from '../../schema/models/types/Workspace'
import {
  createCommit,
  createEvaluationResultV2,
  createEvaluationV2,
  createExperiment,
  createIssue,
  createIssueEvaluationResult,
  createOptimization,
  createProject,
  createSpan,
} from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import { getSpansWithoutIssues } from './getSpansWithoutIssues'

describe('getSpansWithoutIssues', () => {
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

    const workspace2Setup = await createWorkspace()
    workspace2 = workspace2Setup.workspace

    const issueSetup = await createIssue({
      workspace,
      project,
      document,
    })
    issue = issueSetup.issue
  })

  describe('tenant isolation', () => {
    it('only returns spans from the correct workspace', async () => {
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

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

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
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

      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01'),
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit2.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-02'),
      })

      const span3 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentUuid: document.documentUuid,
        commitUuid: commit3.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-03'),
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit: commit2,
        document,
        cursor: null,
        limit: 10,
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

      const draftCommit = await createCommit({
        projectId: project.id,
        user,
        mergedAt: null,
      })

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

      const result = await getSpansWithoutIssues({
        workspace,
        commit: draftCommit,
        document,
        cursor: null,
        limit: 10,
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

      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, commit1.id))

      const result = await getSpansWithoutIssues({
        workspace,
        commit: commit2,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span2.id)
    })
  })

  describe('document filtering', () => {
    it('only returns spans for the specified document', async () => {
      const secondDoc = (
        await createProject({
          workspace,
          documents: {
            'second-doc': 'Second document content',
          },
        })
      ).documents[0]!

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
        documentUuid: secondDoc.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
    })
  })

  describe('issue exclusion filtering', () => {
    it('excludes spans that have active issues', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const spanWithIssue = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-with-issue',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const spanWithoutIssue = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-without-issue',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithIssue,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithoutIssue.id)
    })

    it('includes spans that have only ignored issues', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const spanWithIgnoredIssue = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-with-ignored-issue',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const spanWithoutIssue = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-without-issue',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithIgnoredIssue,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      await database
        .update(issuesTable)
        .set({ ignoredAt: new Date() })
        .where(eq(issuesTable.id, issue.id))

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(2)

      const spanIds = spans.map((s) => s.id)
      expect(spanIds).toContain(spanWithIgnoredIssue.id)
      expect(spanIds).toContain(spanWithoutIssue.id)
    })

    it('excludes spans that have at least one active issue among multiple', async () => {
      const evaluation1 = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const evaluation2 = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const issue2Setup = await createIssue({
        workspace,
        project,
        document,
      })
      const issue2 = issue2Setup.issue

      const spanWithMixedIssues = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-mixed-issues',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: spanWithMixedIssues,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit,
        span: spanWithMixedIssues,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      await createIssueEvaluationResult({
        workspace,
        issue: issue2,
        evaluationResult: evalResult2,
      })

      await database
        .update(issuesTable)
        .set({ ignoredAt: new Date() })
        .where(eq(issuesTable.id, issue.id))

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
    })

    it('includes spans when all associated issues are ignored', async () => {
      const evaluation1 = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const evaluation2 = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const issue2Setup = await createIssue({
        workspace,
        project,
        document,
      })
      const issue2 = issue2Setup.issue

      const spanWithAllIgnoredIssues = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-all-ignored',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult1 = await createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: spanWithAllIgnoredIssues,
      })

      const evalResult2 = await createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit,
        span: spanWithAllIgnoredIssues,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult1,
      })

      await createIssueEvaluationResult({
        workspace,
        issue: issue2,
        evaluationResult: evalResult2,
      })

      await database
        .update(issuesTable)
        .set({ ignoredAt: new Date() })
        .where(eq(issuesTable.id, issue.id))

      await database
        .update(issuesTable)
        .set({ ignoredAt: new Date() })
        .where(eq(issuesTable.id, issue2.id))

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithAllIgnoredIssues.id)
    })
  })

  describe('span type filtering', () => {
    it('only returns prompt type spans', async () => {
      const promptSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-prompt',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-completion',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-tool',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Tool,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(promptSpan.id)
      expect(spans[0]!.type).toBe(SpanType.Prompt)
    })
  })

  describe('span status filtering', () => {
    it('only returns spans with OK status', async () => {
      const okSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ok',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Ok,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(okSpan.id)
      expect(spans[0]!.status).toBe(SpanStatus.Ok)
    })

    it('excludes spans with Error status', async () => {
      const okSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ok',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Ok,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-error',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Error,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(okSpan.id)
    })

    it('excludes spans with Unset status', async () => {
      const okSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ok',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Ok,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-unset',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Unset,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(okSpan.id)
    })

    it('excludes all non-OK status spans', async () => {
      const okSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ok',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Ok,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-error',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Error,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-unset',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Unset,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(okSpan.id)
    })
  })

  describe('pagination', () => {
    it('returns correct page of results', async () => {
      const spanIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          startedAt: new Date(Date.now() + i * 1000),
        })
        spanIds.push(span.id)
      }

      const result1 = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 2,
      })

      expect(result1.ok).toBe(true)
      const { spans: spans1, next: next1 } = result1.unwrap()
      expect(spans1).toHaveLength(2)
      expect(next1).toBeDefined()

      const result2 = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: next1!,
        limit: 2,
      })

      expect(result2.ok).toBe(true)
      const { spans: spans2, next: next2 } = result2.unwrap()
      expect(spans2.length).toBeGreaterThan(0)
      expect(spans2.length).toBeLessThanOrEqual(2)

      if (next2) {
        const result3 = await getSpansWithoutIssues({
          workspace,
          commit,
          document,
          cursor: next2,
          limit: 2,
        })

        expect(result3.ok).toBe(true)
        const { spans: spans3 } = result3.unwrap()
        expect(spans3.length).toBeGreaterThan(0)
        expect(spans3.length).toBeLessThanOrEqual(2)
      }

      const allSpans = new Set([...spans1, ...spans2].map((s) => s.id))
      expect(allSpans.size).toBeLessThanOrEqual(5)
    })

    it('returns empty array when no spans exist', async () => {
      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans, next } = result.unwrap()
      expect(spans).toHaveLength(0)
      expect(next).toBeNull()
    })

    it('returns null cursor when all results fit in one page', async () => {
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans, next } = result.unwrap()
      expect(spans).toHaveLength(2)
      expect(next).toBeNull()
    })
  })

  describe('ordering', () => {
    it('returns spans ordered by startedAt descending', async () => {
      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01'),
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-03'),
      })

      const span3 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-02'),
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(3)

      expect(spans[0]!.id).toBe(span2.id)
      expect(spans[1]!.id).toBe(span3.id)
      expect(spans[2]!.id).toBe(span1.id)
    })
  })

  describe('optimization-related span filtering', () => {
    it('excludes spans with source optimization', async () => {
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-optimization',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Optimization,
      })

      const normalSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-normal',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(normalSpan.id)
    })

    it('excludes experiment spans linked to an optimization via baselineExperimentId', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const { experiment: baselineExperiment } = await createExperiment({
        workspace,
        user,
        document,
        commit,
        evaluations: [evaluation],
      })

      await createOptimization({
        workspace,
        project,
        document,
        baseline: { commit, experiment: baselineExperiment },
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-baseline-exp',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        experimentUuid: baselineExperiment.uuid,
      })

      const normalSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-normal',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(normalSpan.id)
    })

    it('excludes experiment spans linked to an optimization via optimizedExperimentId', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const { experiment: optimizedExperiment } = await createExperiment({
        workspace,
        user,
        document,
        commit,
        evaluations: [evaluation],
      })

      await createOptimization({
        workspace,
        project,
        document,
        baseline: { commit },
        optimized: { experiment: optimizedExperiment },
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-optimized-exp',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        experimentUuid: optimizedExperiment.uuid,
      })

      const normalSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-normal',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(normalSpan.id)
    })

    it('includes experiment spans not linked to any optimization', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const { experiment: standaloneExperiment } = await createExperiment({
        workspace,
        user,
        document,
        commit,
        evaluations: [evaluation],
      })

      const experimentSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-standalone-exp',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Experiment,
        experimentUuid: standaloneExperiment.uuid,
      })

      const normalSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-normal',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(2)
      const spanIds = spans.map((s) => s.id)
      expect(spanIds).toContain(experimentSpan.id)
      expect(spanIds).toContain(normalSpan.id)
    })

    it('returns empty when all spans are from optimizations', async () => {
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-opt',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.Optimization,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
    })
  })

  describe('excludeFailedResults filtering', () => {
    it('includes spans with failed results when excludeFailedResults is false (default)', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const spanWithFailedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-failed-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const spanWithPassedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithFailedResult,
        hasPassed: false,
        error: null,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithPassedResult,
        hasPassed: true,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(2)

      const spanIds = spans.map((s) => s.id)
      expect(spanIds).toContain(spanWithFailedResult.id)
      expect(spanIds).toContain(spanWithPassedResult.id)
    })

    it('excludes spans with failed results when excludeFailedResults is true', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-failed-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      }).then(async (span) => {
        await createEvaluationResultV2({
          workspace,
          evaluation,
          commit,
          span,
          hasPassed: false,
          error: null,
        })
        return span
      })

      const spanWithPassedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithPassedResult,
        hasPassed: true,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        excludeFailedResults: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithPassedResult.id)
    })

    it('excludes spans with null hasPassed when excludeFailedResults is true', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-null-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      }).then(async (span) => {
        const evalResult = await createEvaluationResultV2({
          workspace,
          evaluation,
          commit,
          span,
        })
        await database
          .update(evaluationResultsV2)
          .set({ hasPassed: null })
          .where(eq(evaluationResultsV2.id, evalResult.id))
        return span
      })

      const spanWithPassedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithPassedResult,
        hasPassed: true,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        excludeFailedResults: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithPassedResult.id)
    })

    it('excludes spans with error results when excludeFailedResults is true', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-error-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      }).then(async (span) => {
        await createEvaluationResultV2({
          workspace,
          evaluation,
          commit,
          span,
          hasPassed: null,
          error: { message: 'Some error' },
        })
        return span
      })

      const spanWithPassedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithPassedResult,
        hasPassed: true,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        excludeFailedResults: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithPassedResult.id)
    })

    it('includes spans without any evaluation results when excludeFailedResults is true', async () => {
      const spanWithoutResults = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-no-results',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        excludeFailedResults: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithoutResults.id)
    })

    it('excludes spans with at least one failed result among multiple results', async () => {
      const evaluation1 = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const evaluation2 = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const spanWithMixedResults = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-mixed-results',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: spanWithMixedResults,
        hasPassed: true,
        error: null,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit,
        span: spanWithMixedResults,
        hasPassed: false,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        excludeFailedResults: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
    })
  })

  describe('requirePassedResults filtering', () => {
    it('only returns spans with at least one passed evaluation result', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const spanWithPassedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const spanWithFailedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-failed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-no-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithPassedResult,
        hasPassed: true,
        error: null,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithFailedResult,
        hasPassed: false,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        requirePassedResults: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithPassedResult.id)
    })

    it('returns all spans when requirePassedResults is false (default)', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const spanWithPassedResult = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-no-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: spanWithPassedResult,
        hasPassed: true,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(2)
    })

    it('returns empty when no spans have passed results', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-failed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        hasPassed: false,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        requirePassedResults: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
    })
  })

  describe('requirePassedAnnotations filtering', () => {
    it('only returns spans with at least one passed human evaluation result', async () => {
      const binaryConfig: HumanEvaluationBinaryConfiguration = {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
      }

      const ruleEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const humanEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: binaryConfig,
      })

      const spanWithHumanPassed = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-human-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const spanWithRulePassed = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-rule-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-no-result',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: humanEvaluation,
        commit,
        span: spanWithHumanPassed,
        hasPassed: true,
        error: null,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: ruleEvaluation,
        commit,
        span: spanWithRulePassed,
        hasPassed: true,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        requirePassedAnnotations: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(spanWithHumanPassed.id)
    })

    it('excludes spans where human annotation did not pass', async () => {
      const binaryConfig: HumanEvaluationBinaryConfiguration = {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
      }

      const humanEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
        configuration: binaryConfig,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-human-failed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: humanEvaluation,
        commit,
        span,
        hasPassed: false,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        requirePassedAnnotations: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
    })

    it('returns empty when only rule evaluations exist', async () => {
      const ruleEvaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-rule-only',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: ruleEvaluation,
        commit,
        span,
        hasPassed: true,
        error: null,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        requirePassedAnnotations: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
    })
  })

  describe('complex scenarios', () => {
    it('handles all filters together correctly', async () => {
      const workspace3Setup = await createWorkspace()
      const workspace3 = workspace3Setup.workspace

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

      const secondDoc = (
        await createProject({
          workspace,
          documents: {
            'second-doc': 'Second document content',
          },
        })
      ).documents[0]!

      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace3.id,
        traceId: 'trace-2',
        documentUuid: document.documentUuid,
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentUuid: document.documentUuid,
        commitUuid: commit3.uuid,
        type: SpanType.Prompt,
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

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-4',
        documentUuid: document.documentUuid,
        commitUuid: deletedCommit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-5',
        documentUuid: secondDoc.documentUuid,
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
      })

      const spanWithIssue = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-6',
        documentUuid: document.documentUuid,
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit1,
        span: spanWithIssue,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit: commit2,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
    })

    it('correctly handles spans with issues from different commits', async () => {
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
        commitUuid: commit1.uuid,
        type: SpanType.Prompt,
      })

      const evalResultForCommit2 = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit: commit2,
        span: span1,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResultForCommit2,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit: commit1,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()

      expect(spans).toHaveLength(2)
      const spanIds = spans.map((s) => s.id)
      expect(spanIds).toContain(span1.id)
      expect(spanIds).toContain(span2.id)
    })
  })

  describe('edge cases', () => {
    it('returns empty result when commit history is empty', async () => {
      const isolatedProject = await createProject({
        workspace,
        documents: {
          'isolated-doc': 'Isolated content',
        },
      })

      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, isolatedProject.commit.id))

      const result = await getSpansWithoutIssues({
        workspace,
        commit: isolatedProject.commit,
        document: isolatedProject.documents[0]!,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans, next } = result.unwrap()
      expect(spans).toHaveLength(0)
      expect(next).toBeNull()
    })

    it('handles spans with same startedAt correctly with secondary sort by id', async () => {
      const sameTime = new Date('2024-01-01T12:00:00Z')

      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        id: 'aaa-span',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: sameTime,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        id: 'zzz-span',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: sameTime,
      })

      const result = await getSpansWithoutIssues({
        workspace,
        commit,
        document,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(2)

      expect(spans[0]!.id).toBe(span2.id)
      expect(spans[1]!.id).toBe(span1.id)
    })
  })
})
