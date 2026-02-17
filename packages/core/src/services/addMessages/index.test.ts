import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { LogSources } from '../../constants'
import { Result } from '../../lib/Result'
import { createProject } from '../../tests/factories'
import {
  telemetry as realTelemetry,
  type LatitudeTelemetry,
} from '../../telemetry'
import { addMessages } from './index'
import { writeConversationCache } from '../conversations/cache'
import * as cacheModule from '../conversations/cache'
import * as providerApiKeysDataAccess from '../providerApiKeys/data-access/providerApiKeys'

const mocks = {
  runAi: vi.fn(async () => {
    const fullStream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })

    return Result.ok({
      type: 'text',
      text: Promise.resolve('Fake AI generated text'),
      providerLog: Promise.resolve({ uuid: 'fake-provider-log-uuid' }),
      usage: Promise.resolve({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }),
      toolCalls: Promise.resolve([]),
      response: Promise.resolve({ messages: [] }),
      fullStream,
    })
  }),
}

const aiSpy = vi.spyOn(await import('../ai'), 'ai')

describe('addMessages', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error - we are mocking the function
    aiSpy.mockImplementation(mocks.runAi)
  })

  it('calls telemetry.span.prompt with projectId and all required parameters', async () => {
    const { workspace, documents, commit, providers } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: `
---
provider: openai
model: gpt-4o
---
Hello world
`,
      },
    })

    const document = documents[0]!
    const provider = providers[0]!
    const documentLogUuid = '550e8400-e29b-41d4-a716-446655440000'
    await writeConversationCache({
      documentLogUuid,
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      providerId: provider.id,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    }).then((r) => r.unwrap())

    const mockPrompt = vi
      .fn()
      .mockImplementation(realTelemetry.span.prompt.bind(realTelemetry.span))

    const mockChat = vi
      .fn()
      .mockImplementation(realTelemetry.span.chat.bind(realTelemetry.span))

    const mockTelemetry = {
      ...realTelemetry,
      span: {
        ...realTelemetry.span,
        prompt: mockPrompt,
        chat: mockChat,
      },
    } as unknown as LatitudeTelemetry

    const result = await addMessages(
      {
        workspace,
        documentLogUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      },
      mockTelemetry,
    )

    expect(result.ok).toBe(true)

    expect(mockPrompt).toHaveBeenCalledTimes(0)

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        name: document.path.split('/').at(-1),
      }),
      expect.anything(),
    )
  })

  describe('error handling', () => {
    it('returns error when documentLogUuid is not provided', async () => {
      const { workspace } = await createProject()

      const result = await addMessages({
        workspace,
        documentLogUuid: undefined,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toBe('documentLogUuid is required')
    })

    it('returns error when conversation cache read fails', async () => {
      const { workspace } = await createProject()
      const documentLogUuid = '550e8400-e29b-41d4-a716-446655440000'
      const cacheError = new Error('Cache read failed')

      vi.spyOn(cacheModule, 'readConversationCache').mockResolvedValue(
        Result.error(cacheError),
      )

      const result = await addMessages({
        workspace,
        documentLogUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBe(cacheError)
    })

    it('returns NotFoundError when commitUuid and documentUuid cannot be determined', async () => {
      const { workspace } = await createProject()
      const documentLogUuid = '550e8400-e29b-41d4-a716-446655440000'

      vi.spyOn(cacheModule, 'readConversationCache').mockResolvedValue(
        Result.ok(undefined),
      )

      const result = await addMessages({
        workspace,
        documentLogUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toContain(
        'Cannot add messages to a conversation without commit or document details',
      )
    })
  })

  describe('provider resolution', () => {
    it('uses provider from cache when providerId is present in cache', async () => {
      const { workspace, documents, commit, providers } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: `
---
provider: openai
model: gpt-4o
---
Hello world
`,
        },
      })

      const document = documents[0]!
      const provider = providers[0]!
      const documentLogUuid = '550e8400-e29b-41d4-a716-446655440001'

      await writeConversationCache({
        documentLogUuid,
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        providerId: provider.id,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      }).then((r) => r.unwrap())

      const unsafelyFindProviderSpy = vi.spyOn(
        providerApiKeysDataAccess,
        'unsafelyFindProviderApiKey',
      )

      const result = await addMessages({
        workspace,
        documentLogUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      })

      expect(result.ok).toBe(true)
      expect(unsafelyFindProviderSpy).toHaveBeenCalledWith(provider.id)
    })

    it('returns error when provider from cache cannot be found', async () => {
      const { workspace, documents, commit } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: `
---
provider: openai
model: gpt-4o
---
Hello world
`,
        },
      })

      const document = documents[0]!
      const documentLogUuid = '550e8400-e29b-41d4-a716-446655440002'

      await writeConversationCache({
        documentLogUuid,
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        providerId: 99999,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      }).then((r) => r.unwrap())

      const result = await addMessages({
        workspace,
        documentLogUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toContain(
        'Could not find provider API key with id 99999',
      )
    })

    it('falls back to provider from config when providerId is not in cache', async () => {
      const { workspace, documents, commit } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: `
---
provider: openai
model: gpt-4o
---
Hello world
`,
        },
      })

      const document = documents[0]!
      const documentLogUuid = '550e8400-e29b-41d4-a716-446655440003'

      await writeConversationCache({
        documentLogUuid,
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      }).then((r) => r.unwrap())

      const result = await addMessages({
        workspace,
        documentLogUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      })

      expect(result.ok).toBe(true)
    })

    it('returns error when provider from config cannot be found', async () => {
      const { workspace, documents, commit } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: `
---
provider: openai
model: gpt-4o
---
Hello world
`,
        },
      })

      const document = documents[0]!
      const documentLogUuid = '550e8400-e29b-41d4-a716-446655440004'

      await writeConversationCache({
        documentLogUuid,
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      }).then((r) => r.unwrap())

      vi.spyOn(
        await import('../providerApiKeys/buildMap'),
        'buildProvidersMap',
      ).mockResolvedValue(new Map())

      const result = await addMessages({
        workspace,
        documentLogUuid,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toContain(
        'Could not find provider API key for openai',
      )
    })
  })
})
