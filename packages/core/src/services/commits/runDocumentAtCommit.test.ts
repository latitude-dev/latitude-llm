import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Commit,
  DocumentVersion,
  LogSources,
  ProviderApiKey,
  Providers,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { providerApiKeys } from '../../schema'
import { createProject } from '../../tests/factories'
import { testConsumeStream } from '../../tests/helpers'
import { runDocumentAtCommit } from './index'

// Create a spy for the ai function
const publisherSpy = vi.spyOn(
  await import('../../events/publisher').then((f) => f.publisher),
  'publish',
)
const aiSpy = vi.spyOn(await import('../ai'), 'ai')

describe('runDocumentAtCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - we are mocking the function
    aiSpy.mockImplementation(mocks.runAi)
    publisherSpy.mockImplementation(mocks.publish)
  })

  it('fails if provider api key is not found', async () => {
    const { workspace, document, commit, provider } = await buildData({
      doc1Content: dummyDoc1Content,
    })

    await database
      .update(providerApiKeys)
      .set({ name: 'another-name' })
      .where(eq(providerApiKeys.id, provider.id))

    const result = await runDocumentAtCommit({
      workspace,
      document,
      commit,
      parameters: {},
      source: LogSources.API,
    })

    expect(result?.value?.response).rejects.toThrowError()
    expect(result?.value?.duration).rejects.toThrowError()
  })

  describe('with an existing provider key', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        document: doc,
        commit: cmt,
        provider: prv,
      } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      document = doc
      commit = cmt
      workspace = wsp
      provider = prv
    })

    it('fails if document is not found in commit', async () => {
      const { document } = await buildData({ doc1Content: dummyDoc1Content })
      const result = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      })

      expect(result.error).toBeDefined()
    })

    it('returns document resolvedContent', async () => {
      const result = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      })

      expect(result.value?.resolvedContent.trim()).toEqual(`---
provider: openai
model: gpt-4o
---


This is a test document
<response />`)
    })

    it('pass params to AI', async () => {
      const { stream } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())

      await testConsumeStream(stream)

      expect(aiSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'This is a test document' },
            {
              role: 'assistant',
              content: 'Fake AI generated text',
              toolCalls: [],
            },
          ],
          config: { model: 'gpt-4o', provider: 'openai' },
          provider,
        }),
      )
    })

    it('send documentLogUuid when chain is completed', async () => {
      const { stream } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())
      const { value } = await testConsumeStream(stream)
      expect(value).toEqual([
        {
          data: {
            type: 'chain-step',
            isLastStep: false,
            config: {
              provider: 'openai',
              model: 'gpt-4o',
            },
            messages: [
              {
                role: 'system',
                content: 'This is a test document',
              },
            ],
          },
          event: 'latitude-event',
        },
        {
          event: 'latitude-event',
          data: {
            type: 'chain-step-complete',
            response: {
              documentLogUuid: expect.any(String),
              text: 'Fake AI generated text',
              toolCalls: [],
              providerLog: { uuid: 'fake-provider-log-uuid' },
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            },
          },
        },
        {
          data: {
            type: 'chain-step',
            isLastStep: true,
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
          },
          event: 'latitude-event',
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
              providerLog: { uuid: 'fake-provider-log-uuid' },
              documentLogUuid: expect.any(String),
            },
          },
        },
      ])
    })

    it('calls publisher with correct data', async () => {
      const parameters = { testParam: 'testValue' }
      const { response } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters,
        source: LogSources.API,
      }).then((r) => r.unwrap())

      // Wait for the response promise to resolve
      await response

      expect(publisher.publish).toHaveBeenCalled()
    })
  })
})

// Non-test code moved to the bottom
const mocks = {
  publish: vi.fn(),
  uuid: vi.fn(() => 'fake-document-log-uuid'),
  runAi: vi.fn(async () => {
    const fullStream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })

    return {
      text: Promise.resolve('Fake AI generated text'),
      providerLog: Promise.resolve({ uuid: 'fake-provider-log-uuid' }),
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

const dummyDoc1Content = `
---
provider: openai
model: gpt-4o
---

This is a test document
<response />
`

async function buildData({ doc1Content }: { doc1Content: string }) {
  const { workspace, documents, commit, user, providers } = await createProject(
    {
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: doc1Content,
      },
    },
  )

  return {
    workspace,
    document: documents[0]!,
    commit,
    user,
    provider: providers[0]!,
  }
}

let document: DocumentVersion
let commit: Commit
let workspace: Workspace
let provider: ProviderApiKey
