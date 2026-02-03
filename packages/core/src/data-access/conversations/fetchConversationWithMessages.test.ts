import { beforeEach, describe, expect, it } from 'vitest'
import { SpanType } from '@latitude-data/constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Project } from '../../schema/models/types/Project'
import type { Workspace } from '../../schema/models/types/Workspace'
import {
  createProject,
  createPromptSpan,
  createPromptWithCompletion,
  createSpan,
  createTestMessages,
} from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import { fetchConversationWithMessages } from './fetchConversationWithMessages'
import { createCompletionSpan } from '../../tests/factories/spansWithMetadata'

describe('fetchConversationWithMessages', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion

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
  })

  describe('basic functionality', () => {
    it('returns nil when conversation does not exist', async () => {
      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid: generateUUIDIdentifier(),
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeUndefined()
    })

    it('returns conversation with empty messages when no traces exist', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.External,
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.documentLogUuid).toBe(documentLogUuid)
    })

    it('returns conversation with messages from completion span', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const { input, output } = createTestMessages({
        userText: 'Hello, how are you?',
        assistantText: 'I am doing well!',
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        input,
        output,
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.messages).toHaveLength(2)
      expect(conversation.messages[0]!.role).toBe('user')
      expect(conversation.messages[1]!.role).toBe('assistant')
    })
  })

  describe('tenant isolation', () => {
    it('only returns conversation from correct workspace', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace2.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeUndefined()
    })
  })

  describe('parameters extraction from first trace', () => {
    it('extracts parameters from the first prompt span', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const now = Date.now()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-first',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now),
        parameters: { name: 'Alice', age: 30 },
        ...createTestMessages({ userText: 'First message' }),
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-second',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now + 10000),
        parameters: { name: 'Bob', age: 25 },
        ...createTestMessages({ userText: 'Second message' }),
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.parameters).toEqual({ name: 'Alice', age: 30 })
    })

    it('extracts promptName from the first prompt span', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const now = Date.now()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-first',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        promptName: 'first-prompt-name',
        startedAt: new Date(now),
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-second',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        promptName: 'second-prompt-name',
        startedAt: new Date(now + 10000),
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.promptName).toBe('first-prompt-name')
    })
  })

  describe('messages extraction from last trace', () => {
    it('extracts messages from the last trace completion span', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const now = Date.now()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-first',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now),
        ...createTestMessages({
          userText: 'First user message',
          assistantText: 'First assistant response',
        }),
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-last',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now + 10000),
        ...createTestMessages({
          userText: 'Last user message',
          assistantText: 'Last assistant response',
        }),
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.messages).toHaveLength(2)

      const userMessage = conversation.messages.find((m) => m.role === 'user')
      const assistantMessage = conversation.messages.find(
        (m) => m.role === 'assistant',
      )

      expect(userMessage?.content).toEqual([
        { type: 'text', text: 'Last user message' },
      ])
      expect(assistantMessage?.content).toEqual([
        { type: 'text', text: 'Last assistant response' },
      ])
    })

    it('handles multiple traces with correct ordering', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const now = Date.now()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-middle',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now + 5000),
        parameters: { order: 'middle' },
        ...createTestMessages({ userText: 'Middle message' }),
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-first',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now),
        parameters: { order: 'first' },
        ...createTestMessages({ userText: 'First message' }),
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-last',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now + 10000),
        parameters: { order: 'last' },
        ...createTestMessages({ userText: 'Last message' }),
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!

      expect(conversation.parameters).toEqual({ order: 'first' })

      const userMessage = conversation.messages.find((m) => m.role === 'user')
      expect(userMessage?.content).toEqual([
        { type: 'text', text: 'Last message' },
      ])
    })
  })

  describe('traces array', () => {
    it('includes all assembled traces sorted by startedAt', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const now = Date.now()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-c',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now + 20000),
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-a',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now),
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-b',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(now + 10000),
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.traces).toHaveLength(3)

      expect(conversation.traces[0]!.id).toBe('trace-a')
      expect(conversation.traces[1]!.id).toBe('trace-b')
      expect(conversation.traces[2]!.id).toBe('trace-c')
    })

    it('each trace has correct structure', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.traces).toHaveLength(1)

      const trace = conversation.traces[0]!
      expect(trace.id).toBe('trace-1')
      expect(trace.children).toBeDefined()
      expect(trace.spans).toBeGreaterThan(0)
      expect(trace.startedAt).toBeInstanceOf(Date)
      expect(trace.endedAt).toBeInstanceOf(Date)
    })
  })

  describe('edge cases', () => {
    it('handles conversation with no prompt spans', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.External,
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.promptName).toBeNull()
      expect(conversation.parameters).toBeNull()
    })

    it('handles conversation with no completion spans', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createPromptSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        name: 'prompt-without-completion',
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.messages).toHaveLength(0)
      expect(conversation.promptName).toBe('prompt-without-completion')
    })

    it('handles prompt span without stored metadata', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        name: 'prompt-no-metadata',
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.promptName).toBe('prompt-no-metadata')
      expect(conversation.parameters).toBeNull()
    })

    it('returns empty messages when completion span has no metadata', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const promptSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
        parentId: promptSpan.id,
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.messages).toHaveLength(0)
    })
  })

  describe('nested span hierarchy', () => {
    it('finds completion span in nested hierarchy', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const traceId = 'trace-nested'

      const { span: promptSpan } = await createPromptSpan({
        workspaceId: workspace.id,
        traceId,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        name: 'nested-prompt',
        parameters: { nested: true },
      })

      const stepSpan = await createSpan({
        workspaceId: workspace.id,
        traceId,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
        parentId: promptSpan.id,
      })

      const { input, output } = createTestMessages({
        userText: 'Nested input',
        assistantText: 'Nested output',
      })

      await createCompletionSpan({
        workspaceId: workspace.id,
        traceId,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        parentId: stepSpan.id,
        input,
        output,
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!
      expect(conversation.messages).toHaveLength(2)
      expect(conversation.parameters).toEqual({ nested: true })
    })

    it('finds the last completion span in multi-level hierarchy', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const traceId = 'trace-multi-completion'

      const { span: promptSpan } = await createPromptSpan({
        workspaceId: workspace.id,
        traceId,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(),
      })

      await createCompletionSpan({
        workspaceId: workspace.id,
        traceId,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        parentId: promptSpan.id,
        startedAt: new Date(Date.now() + 100),
        ...createTestMessages({
          userText: 'First completion input',
          assistantText: 'First completion output',
        }),
      })

      await createCompletionSpan({
        workspaceId: workspace.id,
        traceId,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        parentId: promptSpan.id,
        startedAt: new Date(Date.now() + 200),
        ...createTestMessages({
          userText: 'Last completion input',
          assistantText: 'Last completion output',
        }),
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!

      const userMessage = conversation.messages.find((m) => m.role === 'user')
      expect(userMessage?.content).toEqual([
        { type: 'text', text: 'Last completion input' },
      ])
    })
  })

  describe('conversation aggregations are preserved', () => {
    it('includes conversation fields like traceIds and totalTokens', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      await createPromptWithCompletion({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        startedAt: new Date(Date.now() + 5000),
      })

      const result = await fetchConversationWithMessages({
        workspace,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.value!

      expect(conversation.documentLogUuid).toBe(documentLogUuid)
      expect(conversation.traceCount).toBe(2)
      expect(conversation.traceIds).toContain('trace-1')
      expect(conversation.traceIds).toContain('trace-2')
    })
  })
})
