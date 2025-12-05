import { beforeEach, describe, expect, it } from 'vitest'
import { Providers } from '@latitude-data/constants'

import { type Workspace } from '../schema/models/types/Workspace'
import * as factories from '../tests/factories'
import { EvaluationResultsV2Repository } from './evaluationResultsV2Repository'
describe('EvaluationResultsV2Repository', () => {
  let workspace: Workspace
  let repository: EvaluationResultsV2Repository

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createProject()
    workspace = createdWorkspace
    repository = new EvaluationResultsV2Repository(workspace.id)
  })

  describe('fetchPaginatedByIssue', () => {
    it('returns only HITL evaluation results for the given issue', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!
      const { issue } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      // Create HITL evaluation
      const hitlEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: 'human' as any,
        metric: 'binary' as any,
      })

      // Create LLM evaluation
      const llmEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      // Create spans
      const span1 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      const span2 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      // Create HITL evaluation result
      const hitlResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: span1,
      })

      // Create LLM evaluation result
      const llmResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: llmEvaluation,
        commit,
        span: span2,
      })

      // Link both to issue
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: hitlResult,
      })
      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: llmResult,
      })

      // Fetch results
      const { results } = await repository.fetchPaginatedHITLResultsByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      // Should only return HITL result
      expect(results.length).toBe(1)
      expect(results[0]?.id).toBe(hitlResult.id)
    })

    it('only returns results with evaluatedSpanId and evaluatedTraceId', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!
      const { issue } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      const hitlEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: 'human' as any,
        metric: 'binary' as any,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      const result = await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span,
      })

      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: result,
      })

      const { results } = await repository.fetchPaginatedHITLResultsByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 10,
      })

      expect(results.length).toBe(1)
      expect(results[0]?.evaluatedSpanId).toBe(span.id)
      expect(results[0]?.evaluatedTraceId).toBe(span.traceId)
    })

    it('supports pagination', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!
      const { issue } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      const hitlEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: 'human' as any,
        metric: 'binary' as any,
      })

      // Create multiple results
      const results = []
      for (let i = 0; i < 5; i++) {
        const span = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const result = await factories.createEvaluationResultV2({
          workspace,
          evaluation: hitlEvaluation,
          commit,
          span,
        })

        await factories.createIssueEvaluationResult({
          workspace,
          issue,
          evaluationResult: result,
        })
        results.push(result)
      }

      const page1 = await repository.fetchPaginatedHITLResultsByIssue({
        workspace,
        commit,
        issue,
        page: 1,
        pageSize: 2,
      })

      expect(page1.results.length).toBe(2)
      expect(page1.hasNextPage).toBe(true)

      const page2 = await repository.fetchPaginatedHITLResultsByIssue({
        workspace,
        commit,
        issue,
        page: 2,
        pageSize: 2,
      })

      expect(page2.results.length).toBe(2)
      expect(page2.hasNextPage).toBe(true)
    })
  })

  describe('fetchPaginatedWithoutIssuesByDocument', () => {
    it('returns only HITL evaluation results not linked to issues', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!
      const { issue } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      const hitlEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: 'human' as any,
        metric: 'binary' as any,
      })

      // Create spans
      const span1 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      const span2 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      // Create result linked to issue
      const linkedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: span1,
      })

      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: linkedResult,
      })

      // Create result not linked to issue
      const unlinkedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: span2,
      })

      // Fetch results (excluding the issue we created)
      const { results } = await repository.fetchPaginatedHITLResultsByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: issue.id,
        page: 1,
        pageSize: 10,
      })

      // Should only return unlinked result (the linked one is excluded)
      expect(results.length).toBe(1)
      expect(results[0]?.id).toBe(unlinkedResult.id)
    })

    it('only returns results with evaluatedSpanId and evaluatedTraceId', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!
      // Create a dummy issue to exclude (has no results linked to it)
      const { issue: dummyIssue } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      const hitlEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: 'human' as any,
        metric: 'binary' as any,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span,
      })

      const { results } = await repository.fetchPaginatedHITLResultsByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 1,
        pageSize: 10,
      })

      expect(results.length).toBe(1)
      expect(results[0]?.evaluatedSpanId).toBe(span.id)
      expect(results[0]?.evaluatedTraceId).toBe(span.traceId)
    })

    it('supports pagination', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!
      // Create a dummy issue to exclude (has no results linked to it)
      const { issue: dummyIssue } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      const hitlEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: 'human' as any,
        metric: 'binary' as any,
      })

      // Create multiple results
      for (let i = 0; i < 5; i++) {
        const span = await factories.createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        await factories.createEvaluationResultV2({
          workspace,
          evaluation: hitlEvaluation,
          commit,
          span,
        })
      }

      const page1 = await repository.fetchPaginatedHITLResultsByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 1,
        pageSize: 2,
      })

      expect(page1.results.length).toBe(2)
      expect(page1.hasNextPage).toBe(true)

      const page2 = await repository.fetchPaginatedHITLResultsByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: dummyIssue.id,
        page: 2,
        pageSize: 2,
      })

      expect(page2.results.length).toBe(2)
      expect(page2.hasNextPage).toBe(true)
    })

    it('excludes results linked to the specific issue but includes results from other issues', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const document = documents[0]!

      // Create two issues
      const { issue: issue1 } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      const { issue: issue2 } = await factories.createIssue({
        workspace,
        project: { id: commit.projectId } as any,
        document,
      })

      const hitlEvaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: 'human' as any,
        metric: 'binary' as any,
      })

      // Create result linked to issue1 (should be excluded)
      const span1 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      const result1 = await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: span1,
      })
      await factories.createIssueEvaluationResult({
        workspace,
        issue: issue1,
        evaluationResult: result1,
      })

      // Create result linked to issue2 (should be included)
      const span2 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      const result2 = await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: span2,
      })
      await factories.createIssueEvaluationResult({
        workspace,
        issue: issue2,
        evaluationResult: result2,
      })

      // Create result not linked to any issue (should be included)
      const span3 = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      const result3 = await factories.createEvaluationResultV2({
        workspace,
        evaluation: hitlEvaluation,
        commit,
        span: span3,
      })

      // Fetch results excluding issue1
      const { results } = await repository.fetchPaginatedHITLResultsByDocument({
        workspace,
        commit,
        documentUuid: document.documentUuid,
        excludeIssueId: issue1.id,
        page: 1,
        pageSize: 10,
      })

      // Should return result2 (linked to issue2) and result3 (not linked to any issue)
      // Should NOT return result1 (linked to excluded issue1)
      expect(results.length).toBe(2)
      expect(results.find((r) => r.id === result1.id)).toBeUndefined()
      expect(results.find((r) => r.id === result2.id)).toBeDefined()
      expect(results.find((r) => r.id === result3.id)).toBeDefined()
    })
  })
})
