import { SpanType } from '@latitude-data/constants'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { database } from '../../client'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Workspace } from '../../schema/models/types/Workspace'
import {
  createEvaluationResultV2,
  createEvaluationV2,
  createProject,
  createSpan,
} from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import { getSpansByEvaluation } from './getSpansByEvaluation'

describe('getSpansByEvaluation', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = setup.workspace
    commit = setup.commit
    document = setup.documents[0]!
  })

  describe('basic filtering', () => {
    it('returns spans with failed evaluation results when passed is false', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const failedSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-failed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const passedSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: failedSpan,
        hasPassed: false,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: passedSpan,
        hasPassed: true,
      })

      const result = await getSpansByEvaluation({
        workspace,
        commit,
        document,
        evaluationUuid: evaluation.uuid,
        passed: false,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(failedSpan.id)
    })

    it('returns spans with passed evaluation results when passed is true', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const failedSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-failed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const passedSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: failedSpan,
        hasPassed: false,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: passedSpan,
        hasPassed: true,
      })

      const result = await getSpansByEvaluation({
        workspace,
        commit,
        document,
        evaluationUuid: evaluation.uuid,
        passed: true,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(passedSpan.id)
    })

    it('only returns spans for the specified evaluation', async () => {
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

      const span1 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-eval1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const span2 = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-eval2',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: span1,
        hasPassed: false,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit,
        span: span2,
        hasPassed: false,
      })

      const result = await getSpansByEvaluation({
        workspace,
        commit,
        document,
        evaluationUuid: evaluation1.uuid,
        passed: false,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span1.id)
    })

    it('includes spans with null hasPassed when passed is false', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-null-passed',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

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

      const result = await getSpansByEvaluation({
        workspace,
        commit,
        document,
        evaluationUuid: evaluation.uuid,
        passed: false,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans } = result.unwrap()
      expect(spans).toHaveLength(1)
      expect(spans[0]!.id).toBe(span.id)
    })
  })

  describe('tenant isolation', () => {
    it('only returns spans from the correct workspace', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-ws1',
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
      })

      const result = await getSpansByEvaluation({
        workspace: workspace2,
        commit,
        document,
        evaluationUuid: evaluation.uuid,
        passed: false,
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
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      for (let i = 0; i < 5; i++) {
        const span = await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-page-${i}`,
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
          createdAt: new Date(Date.now() + i * 1000),
        })
      }

      const firstPage = await getSpansByEvaluation({
        workspace,
        commit,
        document,
        evaluationUuid: evaluation.uuid,
        passed: false,
        cursor: null,
        limit: 2,
      })

      expect(firstPage.ok).toBe(true)
      const { spans: page1, next } = firstPage.unwrap()
      expect(page1).toHaveLength(2)
      expect(next).toBeDefined()

      const secondPage = await getSpansByEvaluation({
        workspace,
        commit,
        document,
        evaluationUuid: evaluation.uuid,
        passed: false,
        cursor: next!,
        limit: 2,
      })

      expect(secondPage.ok).toBe(true)
      const { spans: page2, next: next2 } = secondPage.unwrap()
      expect(page2.length).toBeGreaterThan(0)
      expect(page2.length).toBeLessThanOrEqual(2)

      if (next2) {
        const thirdPage = await getSpansByEvaluation({
          workspace,
          commit,
          document,
          evaluationUuid: evaluation.uuid,
          passed: false,
          cursor: next2,
          limit: 2,
        })

        expect(thirdPage.ok).toBe(true)
        const { spans: page3 } = thirdPage.unwrap()
        expect(page3.length).toBeGreaterThan(0)
        expect(page3.length).toBeLessThanOrEqual(2)
      }

      const allSpans = new Set([...page1, ...page2].map((s) => s.id))
      expect(allSpans.size).toBeLessThanOrEqual(5)
    })

    it('returns empty when no evaluation results exist for page', async () => {
      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const result = await getSpansByEvaluation({
        workspace,
        commit,
        document,
        evaluationUuid: evaluation.uuid,
        passed: false,
        cursor: null,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { spans, next } = result.unwrap()
      expect(spans).toHaveLength(0)
      expect(next).toBeNull()
    })
  })
})
