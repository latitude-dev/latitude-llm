import app from '$/routes/app'
import { Message, MessageRole } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '@latitude-data/core/constants'
import { Providers } from '@latitude-data/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createProject,
  createDocumentLog,
  createProviderLog,
  helpers,
} from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { describe, expect, it, beforeEach } from 'vitest'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

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
    let provider: ProviderApiKey
    let commit: Commit
    let documents: DocumentVersion[]
    let messages: Message[]

    beforeEach(async () => {
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
      provider = project.providers[0]!
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

      // Create provider log with messages
      messages = [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'Hello, how are you?',
            },
          ],
        },
      ] as Message[]

      await createProviderLog({
        workspace,
        documentLogUuid: conversationUuid,
        providerId: provider.id,
        providerType: Providers.OpenAI,
        source: LogSources.API,
        messages,
        responseText: 'I am doing well, thank you for asking!',
      })
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

      // Verify message structure
      const messagesResponse = data.conversation
      const completeMessages = [
        ...messages,
        {
          role: MessageRole.assistant,
          content: [
            { type: 'text', text: 'I am doing well, thank you for asking!' },
          ],
          toolCalls: [],
        },
      ]
      expect(messagesResponse).toEqual(completeMessages)
    })

    it('returns conversation with multiple messages', async () => {
      // Create another provider log in the same conversation with additional messages
      const additionalMessages = {
        role: MessageRole.user,
        content: [
          {
            type: 'text',
            text: 'What is the weather like?',
          },
        ],
      } as Message

      messages.push(additionalMessages)

      await createProviderLog({
        workspace,
        documentLogUuid: conversationUuid,
        providerId: provider.id,
        providerType: Providers.OpenAI,
        source: LogSources.API,
        messages,
        responseText: 'I cannot check the weather, but I hope it is nice!',
      })

      const res = await app.request(
        `/api/v3/conversations/${conversationUuid}`,
        {
          method: 'GET',
          headers,
        },
      )

      expect(res.status).toBe(200)
      const data = await res.json()

      // Verify message structure
      const messagesResponse = data.conversation
      expect(data.uuid).toBe(conversationUuid)
      expect(messagesResponse.length).toBeGreaterThanOrEqual(3)
      const completeMessages = [
        ...messages,
        {
          role: MessageRole.assistant,
          content: [
            {
              type: 'text',
              text: 'I cannot check the weather, but I hope it is nice!',
            },
          ],
          toolCalls: [],
        },
      ]
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
      // Create a new document log for this specific test
      const { documentLog: testDocumentLog } = await createDocumentLog({
        document: documents[0]!,
        commit,
        parameters: {},
        source: LogSources.API,
        skipProviderLogs: true,
      })

      const testResponseText = 'This is a test response'
      await createProviderLog({
        workspace,
        documentLogUuid: testDocumentLog.uuid,
        providerId: provider.id,
        providerType: Providers.OpenAI,
        source: LogSources.API,
        messages: [
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'Test question',
              },
            ],
          },
        ] as Message[],
        responseText: testResponseText,
      })

      const res = await app.request(
        `/api/v3/conversations/${testDocumentLog.uuid}`,
        {
          method: 'GET',
          headers,
        },
      )

      expect(res.status).toBe(200)
      const data = await res.json()

      // The conversation should include the response text in the last assistant message
      const assistantMessages = data.conversation.filter(
        (msg: any) => msg.role === MessageRole.assistant,
      )
      expect(assistantMessages.length).toBeGreaterThan(0)
      const lastAssistantMessage =
        assistantMessages[assistantMessages.length - 1]

      if (typeof lastAssistantMessage.content === 'string') {
        expect(lastAssistantMessage.content).toBe(testResponseText)
      } else if (Array.isArray(lastAssistantMessage.content)) {
        const textContent = lastAssistantMessage.content.find(
          (c: any) => c.type === 'text',
        )
        if (textContent) {
          expect(textContent.text).toBe(testResponseText)
        }
      }
    })
  })
})
