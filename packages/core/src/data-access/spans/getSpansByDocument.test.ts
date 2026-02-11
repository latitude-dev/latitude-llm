import { LogSources, SpanStatus, SpanType } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Project } from '../../schema/models/types/Project'
import type { User } from '../../schema/models/types/User'
import type { Workspace } from '../../schema/models/types/Workspace'
import {
  createEvaluationV2,
  createExperiment,
  createOptimization,
  createProject,
  createSpan,
} from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import { getSpansByDocument } from './getSpansByDocument'

describe('getSpansByDocument', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let user: User

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!
    user = setup.user
  })

  describe('basic filtering', () => {
    it('returns OK spans from the document', async () => {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ok',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span.id)
    })

    it('excludes spans with non-OK status', async () => {
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-error',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        status: SpanStatus.Error,
      })

      const okSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ok',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(okSpan.id)
    })

    it('only returns spans matching the requested span types', async () => {
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-completion',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
      })

      const promptSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-prompt',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(promptSpan.id)
    })

    it('returns empty when no spans exist', async () => {
      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans, next } = result.unwrap()
      expect(spans).toHaveLength(0)
      expect(next).toBeNull()
    })
  })

  describe('ordering', () => {
    it('returns spans ordered by startedAt descending', async () => {
      const older = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-old',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      })

      const newer = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-new',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-06-01T00:00:00Z'),
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(2)
      expect(spans[0]!.id).toBe(newer.id)
      expect(spans[1]!.id).toBe(older.id)
    })
  })

  describe('tenant isolation', () => {
    it('only returns spans from the correct workspace', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ws1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace: workspace2,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(0)
    })
  })

  describe('pagination', () => {
    it('returns correct page of results', async () => {
      for (let i = 0; i < 5; i++) {
        await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-page-${i}`,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          startedAt: new Date(Date.now() + i * 1000),
        })
      }

      const firstPage = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 2,
      })

      expect(firstPage.ok).toBe(true)
      const { spans: page1, next } = firstPage.unwrap()
      expect(page1).toHaveLength(2)
      expect(next).not.toBeNull()

      const secondPage = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: next!,
        limit: 2,
      })

      expect(secondPage.ok).toBe(true)
      const { spans: page2 } = secondPage.unwrap()
      expect(page2.length).toBeGreaterThan(0)
      expect(page2.length).toBeLessThanOrEqual(2)

      const allIds = new Set([...page1, ...page2].map((s) => s.id))
      expect(allIds.size).toBeLessThanOrEqual(5)
    })
  })

  describe('optimization-related span filtering', () => {
    it('excludes spans with source optimization', async () => {
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-optimization',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        source: LogSources.Optimization,
        type: SpanType.Prompt,
      })

      const normalSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-normal',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        source: LogSources.API,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
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
        source: LogSources.Experiment,
        experimentUuid: baselineExperiment.uuid,
        type: SpanType.Prompt,
      })

      const normalSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-normal',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        source: LogSources.API,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
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
        source: LogSources.Experiment,
        experimentUuid: optimizedExperiment.uuid,
        type: SpanType.Prompt,
      })

      const normalSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-normal',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        source: LogSources.API,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
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

      const { experiment: unlinkedExperiment } = await createExperiment({
        workspace,
        user,
        document,
        commit,
        evaluations: [evaluation],
      })

      const experimentSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-unlinked-exp',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        source: LogSources.Experiment,
        experimentUuid: unlinkedExperiment.uuid,
        type: SpanType.Prompt,
      })

      const result = await getSpansByDocument({
        workspace,
        commit,
        document,
        spanTypes: [SpanType.Prompt],
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(experimentSpan.id)
    })
  })
})
