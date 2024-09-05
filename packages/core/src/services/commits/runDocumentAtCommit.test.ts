import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Commit,
  DocumentVersion,
  LogSources,
  ProviderApiKey,
  Providers,
  SafeUser,
  Workspace,
} from '../../browser'
import { createProject, createProviderApiKey } from '../../tests/factories'
import { testConsumeStream } from '../../tests/helpers'
import { runDocumentAtCommit } from './index'

// Create a spy for the ai function
const aiSpy = vi.spyOn(await import('../ai'), 'ai')

describe('runDocumentAtCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - we are mocking the function
    aiSpy.mockImplementation(mocks.runAi)
  })

  it('fails if document is not found in commit', async () => {
    const { document, commit } = await buildData()
    const result = await runDocumentAtCommit({
      workspaceId: 0,
      document,
      commit,
      parameters: {},
      source: LogSources.API,
    })

    expect(result.error).toBeDefined()
  })

  it('fails if documents has not valid config', async () => {
    const { workspace, document, commit } = await buildData()
    const result = await runDocumentAtCommit({
      workspaceId: workspace.id,
      document,
      commit,
      parameters: {},
      source: LogSources.API,
    })

    await expect(result?.value?.response).rejects.toThrowError(
      'Error validating document configuration',
    )
  })

  it('fails if provider api key is not found', async () => {
    const { workspace, document, commit } = await buildData({
      doc1Content: dummyDoc1Content,
    })
    const result = await runDocumentAtCommit({
      workspaceId: workspace.id,
      document,
      commit,
      parameters: {},
      source: LogSources.API,
    })

    await expect(result?.value?.response).rejects.toThrowError(
      'ProviderApiKey not found',
    )
  })

  describe('with an existing provider key', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user: usr,
        document: doc,
        commit: cmt,
      } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      user = usr
      document = doc
      commit = cmt
      workspaceId = wsp.id
      workspace = wsp
      provider = await createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'openai',
        user,
      })
    })

    it('returns document resolvedContent', async () => {
      const result = await runDocumentAtCommit({
        workspaceId,
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
<step />`)
    })

    it('pass params to AI', async () => {
      const { stream } = await runDocumentAtCommit({
        workspaceId,
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
        workspaceId,
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
              documentLogUuid: expect.any(String),
            },
          },
        },
      ])
    })
  })
})

// Non-test code moved to the bottom
const mocks = {
  uuid: vi.fn(() => 'fake-document-log-uuid'),
  runAi: vi.fn(async () => {
    const fullStream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })

    console.log('called?')

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

const dummyDoc1Content = `
---
provider: openai
model: gpt-4o
---

This is a test document
<step />
`

async function buildData({ doc1Content = '' }: { doc1Content?: string } = {}) {
  const { workspace, documents, commit, user } = await createProject({
    documents: {
      doc1: doc1Content,
    },
  })

  return {
    workspace,
    document: documents[0]!,
    commit,
    user,
  }
}

let document: DocumentVersion
let commit: Commit
let workspaceId: number
let workspace: Workspace
let user: SafeUser
let provider: ProviderApiKey
