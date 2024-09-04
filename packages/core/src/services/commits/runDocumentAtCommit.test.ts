import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Commit,
  DocumentVersion,
  ProviderApiKey,
  Providers,
  SafeUser,
  Workspace,
} from '../../browser'
import { createProject, createProviderApiKey } from '../../tests/factories'
import { testConsumeStream } from '../../tests/helpers'
import { runDocumentAtCommit } from './index'

const mocks = vi.hoisted(() => {
  return {
    uuid: vi.fn(() => 'fake-document-log-uuid'),
    providerLogHandler: vi.fn(),
    runAi: vi.fn(async () => {
      const fullStream = new ReadableStream({
        start(controller) {
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

vi.mock('../ai', async (importMod) => {
  const mod = (await importMod()) as typeof import('../ai')
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
describe('runDocumentAtCommit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fails if document is not found in commit', async () => {
    const { document, commit } = await buildData()
    const result = await runDocumentAtCommit({
      workspaceId: 0,
      document,
      commit,
      parameters: {},
      providerLogHandler: mocks.providerLogHandler,
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
      providerLogHandler: mocks.providerLogHandler,
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
      providerLogHandler: mocks.providerLogHandler,
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
        providerLogHandler: mocks.providerLogHandler,
        // @ts-ignore
        runAi: mocks.runAi,
      })

      expect(result.value?.resolvedContent.trim()).toEqual(`---
provider: openai
model: gpt-4o
---


This is a test document
<step />`)
    })

    it('returns document log UUID', async () => {
      const result = await runDocumentAtCommit({
        workspaceId,
        document,
        commit,
        parameters: {},
        providerLogHandler: mocks.providerLogHandler,
        // @ts-ignore
        runAi: mocks.runAi,
        // @ts-ignore
        generateUUID: mocks.uuid,
      })

      expect(result.value?.documentLogUuid).toEqual('fake-document-log-uuid')
    })

    it('pass params to AI', async () => {
      const { runDocumentAtCommit } = await import('./index')
      const { stream } = await runDocumentAtCommit({
        workspaceId,
        document,
        commit,
        parameters: {},
        // @ts-ignore
        providerLogHandler: mocks.providerLogHandler,
        // @ts-ignore
        generateUUID: mocks.uuid,
      }).then((r) => r.unwrap())

      await testConsumeStream(stream)
      expect(mocks.runAi).toHaveBeenCalledWith(
        {
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
          documentLogUuid: 'fake-document-log-uuid',
        },
        {
          providerLogHandler: mocks.providerLogHandler,
        },
      )
    })

    it('send documentLogUuid when chain is completed', async () => {
      const { runDocumentAtCommit } = await import('./index')
      const { stream } = await runDocumentAtCommit({
        workspaceId,
        document,
        commit,
        parameters: {},
        // @ts-ignore
        providerLogHandler: mocks.providerLogHandler,
        // @ts-ignore
        generateUUID: mocks.uuid,
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
              documentLogUuid: 'fake-document-log-uuid',
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
              documentLogUuid: 'fake-document-log-uuid',
            },
          },
        },
      ])
    })
  })
})
