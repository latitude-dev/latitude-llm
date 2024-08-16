import { ContentType, MessageRole } from '@latitude-data/compiler'
import {
  Commit,
  DocumentVersion,
  ProviderApiKey,
  ProviderLog,
  Providers,
  SafeUser,
  Workspace,
} from '$core/browser'
import { database, factories, providerApiKeys } from '$core/index'
import { createDocumentLog } from '$core/tests/factories'
import { testConsumeStream } from '$core/tests/helpers'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addMessages } from './index'

const mocks = vi.hoisted(() => {
  return {
    providerLogHandler: vi.fn(),
    runAi: vi.fn(async () => {
      const fullStream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'text-delta',
            textDelta: 'AI gener',
          })
          controller.enqueue({
            type: 'text-delta',
            textDelta: 'ated text',
          })

          controller.close()
        },
      })
      return {
        text: Promise.resolve('Fake AI generated text'),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        toolCalls: Promise.resolve([]),
        fullStream,
      }
    }),
  }
})

vi.mock('$core/services/ai', async (importMod) => {
  const mod = (await importMod()) as typeof import('$core/services/ai')
  return {
    ...mod,
    ai: mocks.runAi,
  }
})

const dummyDoc1Content = `
---
provider: openai
model: gpt-4o
---

This is a test document
<step />
`

let document: DocumentVersion
let commit: Commit
let workspace: Workspace
let user: SafeUser
let providerApiKey: ProviderApiKey
let providerLog: ProviderLog

async function buildData({
  doc1Content = dummyDoc1Content,
}: { doc1Content?: string } = {}) {
  const {
    workspace: wsp,
    documents,
    commit: cmt,
    user: usr,
  } = await factories.createProject({
    documents: {
      doc1: doc1Content,
    },
  })
  document = documents.find((d) => d.path === 'doc1')!
  commit = cmt
  workspace = wsp
  user = usr
  providerApiKey = await factories.createProviderApiKey({
    workspace,
    type: Providers.OpenAI,
    name: 'openai',
    user,
  })
  const { providerLogs } = await createDocumentLog({
    commit,
    document,
  })
  return {
    providerApiKey,
    workspace,
    document,
    commit,
    user,
    providerLog: providerLogs[providerLogs.length - 1]!,
  }
}

describe('addMessages', () => {
  beforeEach(async () => {
    vi.resetModules()
    const {
      workspace: wsp,
      user: usr,
      document: doc,
      commit: cmt,
      providerLog: pl,
    } = await buildData({
      doc1Content: dummyDoc1Content,
    })
    user = usr
    document = doc
    commit = cmt
    workspace = wsp
    providerLog = pl
  })

  it('fails if provider log is not found', async () => {
    const result = await addMessages({
      workspace,
      documentLogUuid: uuid(),
      messages: [],
      providerLogHandler: mocks.providerLogHandler,
    })

    expect(result.error).toBeDefined()
  })

  it('pass arguments to AI service', async () => {
    const { addMessages } = await import('./index')
    const { stream } = await addMessages({
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: ContentType.text,
              text: 'This is a user message',
            },
          ],
        },
      ],
      providerLogHandler: mocks.providerLogHandler,
    }).then((r) => r.unwrap())

    await testConsumeStream(stream)
    // Test touched apiKey after running AI
    const provider = await database.query.providerApiKeys.findFirst({
      where: eq(providerApiKeys.id, providerApiKey.id),
    })
    expect(mocks.runAi).toHaveBeenCalledWith(
      {
        messages: [
          ...providerLog.messages,
          {
            role: MessageRole.assistant,
            content: providerLog.responseText,
            toolCalls: providerLog.toolCalls,
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
                text: 'This is a user message',
              },
            ],
          },
        ],
        config: { model: 'gpt-4o', provider: 'openai' },
        provider,
        documentLogUuid: providerLog.documentLogUuid!,
      },
      {
        providerLogHandler: mocks.providerLogHandler,
      },
    )
  })

  it('send documentLogUuid when chain is completed', async () => {
    const { addMessages } = await import('./index')
    const { stream } = await addMessages({
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: ContentType.text,
              text: 'This is a user message',
            },
          ],
        },
      ],
      providerLogHandler: mocks.providerLogHandler,
    }).then((r) => r.unwrap())
    const { value } = await testConsumeStream(stream)

    expect(value).toEqual([
      {
        event: 'provider-event',
        data: { type: 'text-delta', textDelta: 'AI gener' },
      },
      {
        event: 'provider-event',
        data: { type: 'text-delta', textDelta: 'ated text' },
      },
      {
        event: 'latitude-event',
        data: {
          type: 'chain-complete',
          config: {
            provider: 'openai',
            model: 'gpt-4o',
          },
          messages: [
            {
              role: 'assistant',
              content: 'Fake AI generated text',
              toolCalls: [],
            },
          ],
          response: {
            text: 'Fake AI generated text',
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            documentLogUuid: providerLog.documentLogUuid!,
          },
        },
      },
    ])
  })
})
