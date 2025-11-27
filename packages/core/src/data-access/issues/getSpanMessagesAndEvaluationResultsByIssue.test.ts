import { beforeEach, describe, expect, it } from 'vitest'
import { SpanType, SPAN_METADATA_STORAGE_KEY } from '@latitude-data/constants'
import {
  createEvaluationResultV2,
  createEvaluationV2,
  createIssue,
  createIssueEvaluationResult,
  createProject,
  createSpan,
} from '../../tests/factories'
import { getSpanMessagesAndEvaluationResultsByIssue } from './getSpanMessagesAndEvaluationResultsByIssue'
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

describe('getSpanMessagesAndEvaluationResultsByIssue', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let issue: Issue
  let evaluation: EvaluationV2

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
   * Helper function to create an evaluation result and link it to the issue
   */
  async function createEvaluationResultForIssue({
    span,
    hasPassed = false,
    error,
    metadata,
  }: {
    span: Span<SpanType.Prompt>
    hasPassed?: boolean
    error?: { message: string }
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
      hasPassed,
      ...(error ? { error } : {}),
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

    await createIssueEvaluationResult({
      workspace,
      issue,
      evaluationResult: evalResult,
    })

    return evalResult
  }

  it('should return messages and evaluation result reasons for prompt spans', async () => {
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

    await createEvaluationResultForIssue({
      span: promptSpan,
      metadata: {
        reason: 'The response was too verbose',
      },
    })

    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(1)
    expect(data[0]!.messages).toHaveLength(2)
    expect(data[0]!.messages[0]!.role).toBe(MessageRole.user)
    expect(data[0]!.messages[0]!.content).toEqual([
      { type: 'text', text: 'Hello, how are you?' },
    ])
    expect(data[0]!.messages[1]!.role).toBe(MessageRole.assistant)
    expect(data[0]!.messages[1]!.content).toEqual([
      { type: 'text', text: 'I am doing well, thank you!' },
    ])
    expect(data[0]!.reason).toBe('The response was too verbose')
  })

  it('should return empty reason when evaluation result has no reason in metadata', async () => {
    const { promptSpan } = await createPromptSpanWithCompletion({
      traceId: 'trace-2',
    })

    await createEvaluationResultForIssue({
      span: promptSpan,
      metadata: {
        // No reason field
      },
    })

    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(1)
    expect(data[0]!.reason).toBe('')
  })

  it('should return empty reason when evaluation result has error', async () => {
    const { promptSpan } = await createPromptSpanWithCompletion({
      traceId: 'trace-3',
    })

    await createEvaluationResultForIssue({
      span: promptSpan,
      error: { message: 'Evaluation failed' },
      metadata: {
        reason: 'This reason should be ignored',
      },
    })

    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(1)
    expect(data[0]!.reason).toBe('')
  })

  it('should return empty reason when evaluation result has no metadata', async () => {
    const { promptSpan } = await createPromptSpanWithCompletion({
      traceId: 'trace-4',
    })

    await createEvaluationResultForIssue({
      span: promptSpan,
      metadata: undefined,
    })

    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(1)
    expect(data[0]!.reason).toBe('')
  })

  it('should skip non-prompt spans', async () => {
    // Create a non-prompt span (e.g., Http span)
    const httpSpan = await createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Http,
      traceId: 'trace-5',
    })

    await createEvaluationResultForIssue({
      span: httpSpan as any,
      metadata: {
        reason: 'This should be skipped',
      },
    })

    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(0)
  })

  it('should return error when completion span is not found', async () => {
    // Create a prompt span without a completion span
    const promptSpan = await createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      traceId: 'trace-6',
    })

    await createEvaluationResultForIssue({
      span: promptSpan,
      metadata: {
        reason: 'This should cause an error',
      },
    })

    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error!.message).toBe('Could not find completion span')
  })

  it('should return empty array when no spans are found', async () => {
    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(0)
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

    await createEvaluationResultForIssue({
      span: promptSpan,
      metadata: {
        reason: 'Multiple messages test',
      },
    })

    const result = await getSpanMessagesAndEvaluationResultsByIssue({
      workspace,
      commit,
      issue,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.value!
    expect(data).toHaveLength(1)
    expect(data[0]!.messages).toHaveLength(4) // 2 input + 2 output
    expect(data[0]!.messages[0]!.role).toBe(MessageRole.user)
    expect(data[0]!.messages[1]!.role).toBe(MessageRole.user)
    expect(data[0]!.messages[2]!.role).toBe(MessageRole.assistant)
    expect(data[0]!.messages[3]!.role).toBe(MessageRole.assistant)
  })
})
