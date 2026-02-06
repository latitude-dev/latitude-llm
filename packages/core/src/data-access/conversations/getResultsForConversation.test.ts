import { SpanType } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Project } from '../../schema/models/types/Project'
import type { User } from '../../schema/models/types/User'
import type { Workspace } from '../../schema/models/types/Workspace'
import {
  createCommit,
  createEvaluationResultV2,
  createEvaluationV2,
  createProject,
  createPromptWithCompletion,
  createSpan,
} from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import { getResultsForConversation } from './getResultsForConversation'

describe('getResultsForConversation', () => {
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

  describe('basic functionality', () => {
    it('returns empty array when no spans exist for conversation', async () => {
      const result = await getResultsForConversation({
        workspace,
        conversationId: generateUUIDIdentifier(),
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([])
    })

    it('returns empty array when spans exist but no evaluation results', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([])
    })

    it('returns results with evaluations when they exist', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const { promptSpan } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        } as any,
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const results = result.unwrap()
      expect(results).toHaveLength(1)
      expect(results[0]!.evaluation.uuid).toBe(evaluation.uuid)
      expect(results[0]!.result).toBeDefined()
    })
  })

  describe('tenant isolation', () => {
    it('only returns results from the correct workspace', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      const documentLogUuid = generateUUIDIdentifier()

      const { promptSpan } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        },
      })

      const result = await getResultsForConversation({
        workspace: workspace2,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([])
    })
  })

  describe('multiple traces', () => {
    it('returns results from all traces in the conversation', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const { promptSpan: promptSpan1 } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const { promptSpan: promptSpan2 } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(Date.now() + 5000),
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...promptSpan1,
          type: SpanType.Prompt,
        },
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...promptSpan2,
          type: SpanType.Prompt,
        },
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const results = result.unwrap()
      expect(results).toHaveLength(2)
    })
  })

  describe('multiple evaluations', () => {
    it('returns results for different evaluations', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const { promptSpan } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const evaluation1 = await createEvaluationV2({
        workspace,
        document,
        commit,
        name: 'evaluation-1',
      })

      const evaluation2 = await createEvaluationV2({
        workspace,
        document,
        commit,
        name: 'evaluation-2',
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        },
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        },
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const results = result.unwrap()
      expect(results).toHaveLength(2)

      const evaluationUuids = results.map((r) => r.evaluation.uuid)
      expect(evaluationUuids).toContain(evaluation1.uuid)
      expect(evaluationUuids).toContain(evaluation2.uuid)
    })
  })

  describe('different commits', () => {
    it('returns results from different commits', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const commit2 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date(),
      })

      const { promptSpan: promptSpan1 } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const { promptSpan: promptSpan2 } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit2.uuid,
        projectId: project.id,
        startedAt: new Date(Date.now() + 5000),
      })

      const evaluation1 = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      const evaluation2 = await createEvaluationV2({
        workspace,
        document,
        commit: commit2,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation1,
        commit,
        span: {
          ...promptSpan1,
          type: SpanType.Prompt,
        },
      })

      await createEvaluationResultV2({
        workspace,
        evaluation: evaluation2,
        commit: commit2,
        span: {
          ...promptSpan2,
          type: SpanType.Prompt,
        },
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const results = result.unwrap()
      expect(results).toHaveLength(2)
    })
  })

  describe('missing evaluation handling', () => {
    it('skips results when evaluation is not found', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const { promptSpan } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        },
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const results = result.unwrap()
      expect(results).toHaveLength(1)
    })
  })

  describe('result structure', () => {
    it('includes both result and evaluation in response', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const { promptSpan } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
        name: 'test-evaluation',
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        },
        score: 1,
        normalizedScore: 100,
        hasPassed: true,
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const results = result.unwrap()
      expect(results).toHaveLength(1)

      const resultWithEval = results[0]!
      expect(resultWithEval.result.id).toBe(evalResult.id)
      expect(resultWithEval.result.score).toBe(1)
      expect(resultWithEval.result.normalizedScore).toBe(100)
      expect(resultWithEval.result.hasPassed).toBe(true)
      expect(resultWithEval.evaluation.name).toBe('test-evaluation')
      expect(resultWithEval.evaluation.uuid).toBe(evaluation.uuid)
    })
  })

  describe('edge cases', () => {
    it('handles conversation with spans but no documentLogUuid match', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      const { promptSpan } = await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const evaluation = await createEvaluationV2({
        workspace,
        document,
        commit,
      })

      await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...promptSpan,
          type: SpanType.Prompt,
        },
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: documentLogUuid2,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([])
    })

    it('handles spans without documentLogUuid', async () => {
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await getResultsForConversation({
        workspace,
        conversationId: generateUUIDIdentifier(),
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([])
    })
  })
})
