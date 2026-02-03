import app from '$/routes/app'
import { Message, MessageRole } from '@latitude-data/constants/messages'
import { LogSources, SpanType } from '@latitude-data/core/constants'
import { Providers, CompletionSpanMetadata } from '@latitude-data/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createProject,
  createDocumentLog,
  createSpan,
  helpers,
} from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { SpanMetadatasRepository } from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'

describe('GET /conversations/:conversationUuid', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/conversations/fake-uuid', {
        method: 'GET',
      })

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, string>
    let workspace: Workspace
    let conversationUuid: string
    let commit: Commit
    let documents: DocumentVersion[]
    let inputMessages: Message[]

    beforeEach(async () => {
      vi.restoreAllMocks()

      const project = await createProject({
        providers: [
          {
            type: Providers.OpenAI,
            name: 'openai',
          },
        ],
        documents: {
          'test-document.md': helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        },
      })
      workspace = project.workspace
      commit = project.commit
      documents = project.documents

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      headers = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }

      const { documentLog } = await createDocumentLog({
        document: documents[0]!,
        commit,
        parameters: {},
        source: LogSources.API,
        skipProviderLogs: true,
      })

      conversationUuid = documentLog.uuid

      inputMessages = [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'Hello, how are you?',
            },
          ],
        },
      ]

      const outputMessages: Message[] = [
        {
          role: MessageRole.assistant,
          content: [
            { type: 'text', text: 'I am doing well, thank you for asking!' },
          ],
          toolCalls: [],
        },
      ]

      const promptSpan = await createSpan({
        workspaceId: workspace.id,
        documentLogUuid: conversationUuid,
        documentUuid: documents[0]!.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
      })

      const completionSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: promptSpan.traceId,
        parentId: promptSpan.id,
        type: SpanType.Completion,
        source: LogSources.API,
      })

      const mockMetadata: CompletionSpanMetadata = {
        traceId: completionSpan.traceId,
        spanId: completionSpan.id,
        type: SpanType.Completion,
        provider: 'openai',
        model: 'gpt-4o',
        configuration: {},
        input: inputMessages,
        output: outputMessages,
        attributes: {},
        events: [],
        links: [],
      }

      vi.spyOn(SpanMetadatasRepository.prototype, 'get').mockResolvedValue(
        Result.ok(mockMetadata),
      )
    })

    it('successfully retrieves a conversation', async () => {
      const res = await app.request(
        `/api/v3/conversations/${conversationUuid}`,
        {
          method: 'GET',
          headers,
        },
      )

      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data).toHaveProperty('uuid')
      expect(data.uuid).toBe(conversationUuid)
      expect(data).toHaveProperty('conversation')
      expect(Array.isArray(data.conversation)).toBe(true)
      expect(data.conversation.length).toBeGreaterThan(0)

      const messagesResponse = data.conversation
      const completeMessages = [
        ...inputMessages,
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I am doing well, thank you for asking!' },
          ],
          toolCalls: [],
        },
      ]
      expect(messagesResponse).toEqual(completeMessages)

      expect(data).toHaveProperty('source')
      expect(data.source).toEqual({
        documentUuid: documents[0]!.documentUuid,
        commitUuid: commit.uuid,
      })
    })

    it('returns conversation with multiple messages', async () => {
      const multipleInputMessages = [
        ...inputMessages,
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is the weather like?',
            },
          ],
        },
      ] as Message[]

      const outputMessages = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I cannot check the weather, but I hope it is nice!',
            },
          ],
          toolCalls: [],
        },
      ] as Message[]

      const mockMetadata: CompletionSpanMetadata = {
        traceId: 'trace-id',
        spanId: 'span-id',
        type: SpanType.Completion,
        provider: 'openai',
        model: 'gpt-4o',
        configuration: {},
        input: multipleInputMessages,
        output: outputMessages,
        attributes: {},
        events: [],
        links: [],
      }

      vi.spyOn(SpanMetadatasRepository.prototype, 'get').mockResolvedValue(
        Result.ok(mockMetadata),
      )

      const res = await app.request(
        `/api/v3/conversations/${conversationUuid}`,
        {
          method: 'GET',
          headers,
        },
      )

      expect(res.status).toBe(200)
      const data = await res.json()

      const messagesResponse = data.conversation
      expect(data.uuid).toBe(conversationUuid)
      expect(messagesResponse.length).toBeGreaterThanOrEqual(3)
      const completeMessages = [...multipleInputMessages, ...outputMessages]
      expect(messagesResponse).toEqual(completeMessages)
    })

    it('returns 404 for non-existent conversation', async () => {
      const nonExistentUuid = generateUUIDIdentifier()

      const res = await app.request(
        `/api/v3/conversations/${nonExistentUuid}`,
        {
          method: 'GET',
          headers,
        },
      )

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data).toHaveProperty('name')
      expect(data.name).toBe('NotFoundError')
      expect(data.message).toBe('Conversation not found')
    })

    it('returns conversation with response text when available', async () => {
      const { documentLog: testDocumentLog } = await createDocumentLog({
        document: documents[0]!,
        commit,
        parameters: {},
        source: LogSources.API,
        skipProviderLogs: true,
      })

      const testResponseText = 'This is a test response'
      const testInputMessages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Test question',
            },
          ],
        },
      ] as Message[]

      const testOutputMessages = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: testResponseText }],
          toolCalls: [],
        },
      ] as Message[]

      const promptSpan = await createSpan({
        workspaceId: workspace.id,
        documentLogUuid: testDocumentLog.uuid,
        documentUuid: documents[0]!.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
      })

      const completionSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: promptSpan.traceId,
        parentId: promptSpan.id,
        type: SpanType.Completion,
        source: LogSources.API,
      })

      const mockMetadata: CompletionSpanMetadata = {
        traceId: completionSpan.traceId,
        spanId: completionSpan.id,
        type: SpanType.Completion,
        provider: 'openai',
        model: 'gpt-4o',
        configuration: {},
        input: testInputMessages,
        output: testOutputMessages,
        attributes: {},
        events: [],
        links: [],
      }

      vi.spyOn(SpanMetadatasRepository.prototype, 'get').mockResolvedValue(
        Result.ok(mockMetadata),
      )

      const res = await app.request(
        `/api/v3/conversations/${testDocumentLog.uuid}`,
        {
          method: 'GET',
          headers,
        },
      )

      expect(res.status).toBe(200)
      const data = await res.json()

      const assistantMessages = data.conversation.filter(
        (msg: { role: string }) => msg.role === 'assistant',
      )
      expect(assistantMessages.length).toBeGreaterThan(0)
      const lastAssistantMessage =
        assistantMessages[assistantMessages.length - 1]

      if (typeof lastAssistantMessage.content === 'string') {
        expect(lastAssistantMessage.content).toBe(testResponseText)
      } else if (Array.isArray(lastAssistantMessage.content)) {
        const textContent = lastAssistantMessage.content.find(
          (c: { type: string }) => c.type === 'text',
        )
        if (textContent) {
          expect(textContent.text).toBe(testResponseText)
        }
      }
    })
  })
})
