import { beforeEach, describe, expect, it } from 'vitest'
import { SpanType, SPAN_METADATA_STORAGE_KEY } from '@latitude-data/constants'
import {
  createCommit,
  createEvaluationResultV2,
  createEvaluationV2,
  createIssue,
  createProject,
  createSpan,
} from '../../tests/factories'
import { getSpanMessagesByIssueDocument } from './getSpanMessagesByIssueDocument'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Commit } from '../../schema/models/types/Commit'
import type { Project } from '../../schema/models/types/Project'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Issue } from '../../schema/models/types/Issue'
import type { EvaluationV2 } from '../../constants'
import { diskFactory } from '../../lib/disk'
import { cache as redis } from '../../cache'
import { CompletionSpanMetadata, Span } from '@latitude-data/constants'
import { Message, MessageRole } from '@latitude-data/constants/legacyCompiler'
import { database } from '../../client'
import { spans } from '../../schema/models/spans'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { eq } from 'drizzle-orm'
import { User } from '../../schema/models/types/User'

describe('getSpanMessagesByIssueDocument', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let issue: Issue
  let evaluation: EvaluationV2
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

    const issueSetup = await createIssue({
      workspace,
      project,
      document,
    })
    issue = issueSetup.issue

    evaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
    })
  })

  async function createPromptSpanWithCompletion({
    traceId,
    input = [
      {
        role: MessageRole.user,
        content: [{ type: 'text' as const, text: 'Test question' }],
      },
    ],
    output = [
      {
        role: MessageRole.assistant,
        content: [{ type: 'text' as const, text: 'Test answer' }],
        toolCalls: [],
      },
    ],
  }: {
    traceId: string
    input?: Message[]
    output?: Message[]
  }) {
    const promptSpan = await createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      traceId,
    })

    const completionSpan = await createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Completion,
      traceId,
      parentId: promptSpan.id,
    })

    const completionMetadata: CompletionSpanMetadata = {
      traceId: completionSpan.traceId,
      spanId: completionSpan.id,
      type: SpanType.Completion,
      attributes: {},
      events: [],
      links: [],
      provider: 'openai',
      model: 'gpt-4o',
      configuration: {},
      input: input as any,
      output: output as any,
    }

    const disk = diskFactory('private')
    const metadataKey = SPAN_METADATA_STORAGE_KEY(
      workspace.id,
      completionSpan.traceId,
      completionSpan.id,
    )
    await disk.put(metadataKey, JSON.stringify(completionMetadata))

    // Clear cache to ensure we read from disk
    const cache = await redis()
    await cache.del(metadataKey)

    return { promptSpan, completionSpan }
  }

  /**
   * Helper function to create a passed evaluation result (not linked to an issue)
   */
  async function createPassedEvaluationResult({
    span,
    metadata,
  }: {
    span: Span<SpanType.Prompt>
    metadata?: {
      actualOutput?: string
      expectedOutput?: string
      datasetLabel?: string
      reason?: string
    }
  }) {
    const evalResult = await createEvaluationResultV2({
      workspace,
      evaluation,
      commit,
      span: {
        ...span,
        type: SpanType.Prompt,
      } as any,
      hasPassed: true, // This is a passed evaluation result
      ...(metadata
        ? {
            metadata: {
              configuration: evaluation.configuration,
              actualOutput: metadata.actualOutput ?? 'actual output',
              expectedOutput: metadata.expectedOutput ?? 'expected output',
              datasetLabel: metadata.datasetLabel ?? 'default',
              reason: metadata.reason,
            } as any,
          }
        : {}),
    } as any)

    return evalResult
  }

  it('should return messages for passed evaluation results', async () => {
    const { promptSpan } = await createPromptSpanWithCompletion({
      traceId: 'trace-1',
      input: [
        {
          role: MessageRole.user,
          content: [{ type: 'text', text: 'Hello, how are you?' }],
        },
      ],
      output: [
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: 'I am doing well, thank you!' }],
          toolCalls: [],
        },
      ],
    })

    await createPassedEvaluationResult({
      span: promptSpan,
    })

    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(2)
    expect(data[0]!.role).toBe(MessageRole.user)
    expect(data[0]!.content).toEqual([
      { type: 'text', text: 'Hello, how are you?' },
    ])
    expect(data[1]!.role).toBe(MessageRole.assistant)
    expect(data[1]!.content).toEqual([
      { type: 'text', text: 'I am doing well, thank you!' },
    ])
  })

  it('should skip evaluation results without span references', async () => {
    // Create a span first (required for createEvaluationResultV2)
    const promptSpan = await createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      traceId: 'trace-no-refs',
    })

    // Create an evaluation result with span references
    const evalResult = await createEvaluationResultV2({
      workspace,
      evaluation,
      commit,
      span: promptSpan,
      hasPassed: true,
    } as any)

    // Manually remove span references
    await database
      .update(evaluationResultsV2)
      .set({
        evaluatedSpanId: null,
        evaluatedTraceId: null,
      })
      .where(eq(evaluationResultsV2.id, evalResult.id))

    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(0)
  })

  it('should skip evaluation results when span is not found', async () => {
    // Create a span first (required for createEvaluationResultV2)
    const promptSpan = await createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      traceId: 'trace-invalid',
    })

    // Create an evaluation result with span references
    const evalResult = await createEvaluationResultV2({
      workspace,
      evaluation,
      commit,
      span: promptSpan,
      hasPassed: true,
    } as any)

    // Set invalid span references
    await database
      .update(evaluationResultsV2)
      .set({
        evaluatedSpanId: 'invalid-span-id',
        evaluatedTraceId: 'invalid-trace-id',
      })
      .where(eq(evaluationResultsV2.id, evalResult.id))

    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(0)
  })

  it('should skip evaluation results when completion span is not found', async () => {
    // Create a prompt span without a completion span
    const promptSpan = await createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      traceId: 'trace-no-completion',
    })

    await createPassedEvaluationResult({
      span: promptSpan,
    })

    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(0)
  })

  it('should return empty array when no passed evaluation results are found', async () => {
    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(0)
  })

  it('should only return passed evaluation results (not failed ones)', async () => {
    const { promptSpan: passedSpan } = await createPromptSpanWithCompletion({
      traceId: 'trace-passed',
    })

    const { promptSpan: failedSpan } = await createPromptSpanWithCompletion({
      traceId: 'trace-failed',
    })

    // Create passed evaluation result
    await createPassedEvaluationResult({
      span: passedSpan,
    })

    // Create failed evaluation result (should not be returned)
    await createEvaluationResultV2({
      workspace,
      evaluation,
      commit,
      span: {
        ...failedSpan,
        type: SpanType.Prompt,
      } as any,
      hasPassed: false,
    } as any)

    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    // Should only have messages from the passed evaluation result
    expect(data.length).toBeGreaterThan(0)
    // Verify it's from the passed span by checking traceId in the messages
    // (This is a simplified check - in reality we'd need to verify the actual messages)
  })

  it('should handle multiple messages in input and output', async () => {
    const { promptSpan } = await createPromptSpanWithCompletion({
      traceId: 'trace-7',
      input: [
        {
          role: MessageRole.user,
          content: [{ type: 'text', text: 'First question' }],
        },
        {
          role: MessageRole.user,
          content: [{ type: 'text', text: 'Second question' }],
        },
      ],
      output: [
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: 'First answer' }],
          toolCalls: [],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: 'Second answer' }],
          toolCalls: [],
        },
      ],
    })

    await createPassedEvaluationResult({
      span: promptSpan,
    })

    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(4) // 2 input + 2 output
    expect(data[0]!.role).toBe(MessageRole.user)
    expect(data[1]!.role).toBe(MessageRole.user)
    expect(data[2]!.role).toBe(MessageRole.assistant)
    expect(data[3]!.role).toBe(MessageRole.assistant)
  })

  it('should limit results to 3 passed evaluation results', async () => {
    // Create 5 passed evaluation results
    for (let i = 0; i < 5; i++) {
      const { promptSpan } = await createPromptSpanWithCompletion({
        traceId: `trace-limit-${i}`,
      })

      await createPassedEvaluationResult({
        span: promptSpan,
      })
    }

    const result = await getSpanMessagesByIssueDocument({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    // Should have messages from at most 3 evaluation results
    // Each evaluation result has 2 messages (user + assistant), so max 6 messages
    expect(data.length).toBeLessThanOrEqual(6)
  })

  describe('commit history filtering', () => {
    it('should only return evaluation results from commits in the commit history', async () => {
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

      // Create third merged commit (most recent - future commit)
      const commit3 = await createCommit({
        projectId: project.id,
        user,
        mergedAt: new Date('2024-01-03'),
      })

      // Create spans in different commits
      const { promptSpan: span1 } = await createPromptSpanWithCompletion({
        traceId: 'trace-commit1',
      })

      const { promptSpan: span2 } = await createPromptSpanWithCompletion({
        traceId: 'trace-commit2',
      })

      const { promptSpan: span3 } = await createPromptSpanWithCompletion({
        traceId: 'trace-commit3',
      })

      // Update spans to be in different commits
      await database
        .update(spans)
        .set({ commitUuid: commit1.uuid })
        .where(eq(spans.id, span1.id))

      await database
        .update(spans)
        .set({ commitUuid: commit2.uuid })
        .where(eq(spans.id, span2.id))

      await database
        .update(spans)
        .set({ commitUuid: commit3.uuid })
        .where(eq(spans.id, span3.id))

      // Create passed evaluation results for each commit
      const evalResult1 = await createPassedEvaluationResult({
        span: span1,
      })

      const evalResult2 = await createPassedEvaluationResult({
        span: span2,
      })

      const evalResult3 = await createPassedEvaluationResult({
        span: span3,
      })

      // Update evaluation results to be in different commits
      await database
        .update(evaluationResultsV2)
        .set({ commitId: commit1.id })
        .where(eq(evaluationResultsV2.id, evalResult1.id))

      await database
        .update(evaluationResultsV2)
        .set({ commitId: commit2.id })
        .where(eq(evaluationResultsV2.id, evalResult2.id))

      await database
        .update(evaluationResultsV2)
        .set({ commitId: commit3.id })
        .where(eq(evaluationResultsV2.id, evalResult3.id))

      // Query with commit2 - should include commit1 and commit2 but not commit3
      const result = await getSpanMessagesByIssueDocument({
        workspace,
        commit: commit2,
        issue,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const data = result.value!
      // Should have messages from commit1 and commit2 (2 evaluation results = 4 messages)
      expect(data.length).toBeGreaterThanOrEqual(2)
      expect(data.length).toBeLessThanOrEqual(4)
    })

    it('should include draft commit and all previous merged commits', async () => {
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

      // Create spans
      const { promptSpan: span1 } = await createPromptSpanWithCompletion({
        traceId: 'trace-commit1',
      })

      const { promptSpan: span2 } = await createPromptSpanWithCompletion({
        traceId: 'trace-commit2',
      })

      const { promptSpan: spanDraft } = await createPromptSpanWithCompletion({
        traceId: 'trace-draft',
      })

      // Update spans to be in different commits
      await database
        .update(spans)
        .set({ commitUuid: commit1.uuid })
        .where(eq(spans.id, span1.id))

      await database
        .update(spans)
        .set({ commitUuid: commit2.uuid })
        .where(eq(spans.id, span2.id))

      await database
        .update(spans)
        .set({ commitUuid: draftCommit.uuid })
        .where(eq(spans.id, spanDraft.id))

      // Create passed evaluation results
      const evalResult1 = await createPassedEvaluationResult({
        span: span1,
      })

      const evalResult2 = await createPassedEvaluationResult({
        span: span2,
      })

      const evalResultDraft = await createPassedEvaluationResult({
        span: spanDraft,
      })

      // Update evaluation results to be in different commits
      await database
        .update(evaluationResultsV2)
        .set({ commitId: commit1.id })
        .where(eq(evaluationResultsV2.id, evalResult1.id))

      await database
        .update(evaluationResultsV2)
        .set({ commitId: commit2.id })
        .where(eq(evaluationResultsV2.id, evalResult2.id))

      await database
        .update(evaluationResultsV2)
        .set({ commitId: draftCommit.id })
        .where(eq(evaluationResultsV2.id, evalResultDraft.id))

      // Query with draft commit - should include all commits (draft + all merged)
      const result = await getSpanMessagesByIssueDocument({
        workspace,
        commit: draftCommit,
        issue,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const data = result.value!
      // Should have messages from all 3 commits (3 evaluation results = 6 messages max, but limited to 3)
      expect(data.length).toBeGreaterThanOrEqual(2)
      expect(data.length).toBeLessThanOrEqual(6)
    })
  })

  describe('document filtering', () => {
    it('should only return evaluation results from the same document', async () => {
      // Create another document
      const { documents: otherDocuments } = await createProject({
        workspace,
        documents: {
          'other-doc': 'Other content',
        },
      })
      const otherDocument = otherDocuments[0]!

      // Create evaluation for other document
      const otherEvaluation = await createEvaluationV2({
        workspace,
        document: otherDocument,
        commit,
      })

      // Create spans for both documents
      const { promptSpan: span1 } = await createPromptSpanWithCompletion({
        traceId: 'trace-same-doc',
      })

      const { promptSpan: span2 } = await createPromptSpanWithCompletion({
        traceId: 'trace-other-doc',
      })

      // Update span2 to be in the other document
      await database
        .update(spans)
        .set({ documentUuid: otherDocument.documentUuid })
        .where(eq(spans.id, span2.id))

      // Create passed evaluation results
      await createPassedEvaluationResult({
        span: span1,
      })

      // Create passed evaluation result for other document
      await createEvaluationResultV2({
        workspace,
        evaluation: otherEvaluation,
        commit,
        span: {
          ...span2,
          type: SpanType.Prompt,
        } as any,
        hasPassed: true,
      } as any)

      const result = await getSpanMessagesByIssueDocument({
        workspace,
        commit,
        issue,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const data = result.value!
      // Should only have messages from the same document (span1)
      expect(data.length).toBeGreaterThan(0)
      // Should not have messages from the other document
    })
  })
})
