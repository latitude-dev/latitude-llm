import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LogSources, Providers } from '@latitude-data/constants'
import * as factories from '../../../../tests/factories'
import { processSpanCreated } from './processSpanCreated'

type DocumentLogPayload = {
  prompt?: { documentUuid: string }
  uuid?: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  duration?: number
  source?: string
  commitUuid?: string
  messages?: unknown[]
  toolCalls?: unknown[]
  response?: string
}

describe('processSpanCreated', () => {
  let workspaceId: number

  beforeEach(async () => {
    vi.clearAllMocks()
    const { workspace } = await factories.createWorkspace()
    workspaceId = workspace.id
  })

  describe('basic span processing', () => {
    it('returns error when span is not found', async () => {
      const result = await processSpanCreated({
        spanId: 'non-existent',
        traceId: 'non-existent',
        workspaceId,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toBe('Span not found')
    })

    it('returns payload with span data', async () => {
      const { span } = await factories.createPromptSpan({
        workspaceId,
        source: LogSources.API,
      })

      const result = await processSpanCreated({
        spanId: span.id,
        traceId: span.traceId,
        workspaceId,
      })

      expect(result.ok).toBe(true)
      expect(result.value).toMatchObject({
        eventType: 'documentLogCreated',
        payload: expect.objectContaining({
          uuid: span.documentLogUuid,
          source: LogSources.API,
        }),
      })
    })

    it('returns eventType as documentLogCreated for backward compatibility', async () => {
      const { span } = await factories.createPromptSpan({
        workspaceId,
      })

      const result = await processSpanCreated({
        spanId: span.id,
        traceId: span.traceId,
        workspaceId,
      })

      expect(result.ok).toBe(true)
      expect(result.value?.eventType).toBe('documentLogCreated')
    })
  })

  describe('document fetching', () => {
    it('includes prompt when documentUuid and commitUuid are present', async () => {
      const { workspace, project, commit, documents } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            test: factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const document = documents[0]!
      const { span } = await factories.createPromptSpan({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
      })

      const result = await processSpanCreated({
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      })

      expect(result.ok).toBe(true)
      const payload = result.value?.payload as DocumentLogPayload
      expect(payload.prompt).toBeDefined()
      expect(payload.prompt?.documentUuid).toBe(document.documentUuid)
    })

    it('returns undefined prompt when documentUuid is missing', async () => {
      const { span } = await factories.createPromptSpan({
        workspaceId,
        documentUuid: undefined,
        commitUuid: undefined,
      })

      const result = await processSpanCreated({
        spanId: span.id,
        traceId: span.traceId,
        workspaceId,
      })

      expect(result.ok).toBe(true)
      const payload = result.value?.payload as DocumentLogPayload
      expect(payload.prompt).toBeUndefined()
    })
  })

  describe('metadata extraction', () => {
    it('includes parameters from metadata', async () => {
      const { workspace, project, commit, documents } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            test: factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const document = documents[0]!
      const { span } = await factories.createPromptSpan({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        parameters: { foo: 'bar', count: 42 },
      })

      const result = await processSpanCreated({
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      })

      expect(result.ok).toBe(true)
      const payload = result.value?.payload as DocumentLogPayload
      expect(payload.parameters).toEqual({ foo: 'bar', count: 42 })
    })
  })

  describe('completion span messages', () => {
    it('extracts messages and response from completion span', async () => {
      const { workspace, project, commit, documents } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            test: factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const document = documents[0]!
      const { input, output } = factories.createTestMessages({
        userText: 'Hello',
        assistantText: 'Hi there!',
      })

      const { promptSpan } = await factories.createPromptWithCompletion({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        input,
        output,
      })

      const result = await processSpanCreated({
        spanId: promptSpan.id,
        traceId: promptSpan.traceId,
        workspaceId: workspace.id,
      })

      expect(result.ok).toBe(true)
      const payload = result.value?.payload as DocumentLogPayload
      expect(payload.messages).toEqual(input)
      expect(payload.response).toBe('Hi there!')
    })

    it('extracts tool calls from output messages', async () => {
      const { workspace, project, commit, documents } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            test: factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const document = documents[0]!
      const output = [
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'tool-call' as const,
              toolCallId: 'call-123',
              toolName: 'get_weather',
              args: { location: 'NYC' },
            },
          ],
          toolCalls: [],
        },
      ]

      const { promptSpan } = await factories.createPromptWithCompletion({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        output,
      })

      const result = await processSpanCreated({
        spanId: promptSpan.id,
        traceId: promptSpan.traceId,
        workspaceId: workspace.id,
      })

      expect(result.ok).toBe(true)
      const payload = result.value?.payload as DocumentLogPayload
      expect(payload.toolCalls).toEqual([
        {
          id: 'call-123',
          name: 'get_weather',
          arguments: { location: 'NYC' },
        },
      ])
    })

    it('returns undefined messages when no completion span exists', async () => {
      const { span } = await factories.createPromptSpan({
        workspaceId,
      })

      const result = await processSpanCreated({
        spanId: span.id,
        traceId: span.traceId,
        workspaceId,
      })

      expect(result.ok).toBe(true)
      const payload = result.value?.payload as DocumentLogPayload
      expect(payload.messages).toBeUndefined()
      expect(payload.response).toBeUndefined()
      expect(payload.toolCalls).toBeUndefined()
    })
  })
})
