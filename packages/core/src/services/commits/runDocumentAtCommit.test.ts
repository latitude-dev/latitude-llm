import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LogSources, Providers } from '../../browser'
import { publisher } from '../../events/publisher'
import { Ok, Result, UnprocessableEntityError } from '../../lib'
import { ProviderLogsRepository } from '../../repositories'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '../../tests/factories'
import { testConsumeStream } from '../../tests/helpers'
import { runDocumentAtCommit } from './index'

const mocks = {
  publish: vi.fn(),
  uuid: vi.fn(() => 'fake-document-log-uuid'),
  runAi: vi.fn(async () => {
    const fullStream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })

    return Result.ok({
      type: 'text',
      data: {
        text: Promise.resolve('Fake AI generated text'),
        providerLog: Promise.resolve({ uuid: 'fake-provider-log-uuid' }),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        toolCalls: Promise.resolve([]),
        fullStream,
      },
    })
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
  const { workspace, project, documents, commit, user, providers } =
    await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: doc1Content,
      },
    })

  return {
    workspace,
    document: documents[0]!,
    commit,
    user,
    project,
    provider: providers[0]!,
  }
}

const publisherSpy = vi.spyOn(
  await import('../../events/publisher').then((f) => f.publisher),
  'publishLater',
)
const aiSpy = vi.spyOn(await import('../ai'), 'ai')
const createDocumentLogSpy = vi.spyOn(
  await import('../documentLogs/create'),
  'createDocumentLog',
)

describe('runDocumentAtCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - we are mocking the function
    aiSpy.mockImplementation(mocks.runAi)
    // @ts-expect-error - we are mocking the function
    publisherSpy.mockImplementation(mocks.publishLater)
  })

  describe('with an existing provider key', () => {
    it('fails if document is not found in commit', async () => {
      const { workspace, project, user, commit, provider } = await buildData({
        doc1Content: dummyDoc1Content,
      })

      const { commit: draft } = await createDraft({
        project,
        user,
      })
      const { documentVersion: documentNotInCommit } =
        await createDocumentVersion({
          workspace,
          user,
          commit: draft,
          path: 'path/to/document',
          content: helpers.createPrompt({ provider }),
        })
      const result = await runDocumentAtCommit({
        workspace,
        document: documentNotInCommit,
        commit,
        parameters: {},
        source: LogSources.API,
      })

      expect(result.error).toEqual(
        new UnprocessableEntityError('Document not found in commit', {}),
      )
    })

    it('returns document resolvedContent', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const { response, duration, resolvedContent } = await runDocumentAtCommit(
        {
          workspace,
          document,
          commit,
          parameters: {},
          source: LogSources.API,
        },
      ).then((r) => r.unwrap())

      await response
      await duration

      expect(resolvedContent.trim()).toEqual(`---
provider: openai
model: gpt-4o
---


This is a test document
<response />`)
    })

    it('pass params to AI', async () => {
      const { workspace, document, commit, provider } = await buildData({
        doc1Content: dummyDoc1Content,
      })

      const { stream, duration, response } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())

      await response
      await duration

      await testConsumeStream(stream)

      expect(aiSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'This is a test document' },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Fake AI generated text' }],
              toolCalls: [],
            },
          ],
          config: { model: 'gpt-4o', provider: 'openai' },
          provider,
        }),
      )
    })

    it('send documentLogUuid when chain is completed', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const { response, duration, stream } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())

      await response
      await duration

      const { value } = await testConsumeStream(stream)
      const repo = new ProviderLogsRepository(workspace.id)
      const logs = await repo.findAll().then((r) => r.unwrap())

      expect(value).toEqual([
        {
          data: {
            type: 'chain-step',
            isLastStep: false,
            documentLogUuid: expect.any(String),
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
            documentLogUuid: expect.any(String),
            response: {
              streamType: 'text',
              documentLogUuid: expect.any(String),
              text: 'Fake AI generated text',
              toolCalls: [],
              providerLog: undefined,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            },
          },
        },
        {
          data: {
            type: 'chain-step',
            isLastStep: true,
            documentLogUuid: expect.any(String),
            config: {
              provider: 'openai',
              model: 'gpt-4o',
            },
            messages: [
              {
                role: 'assistant',
                content: [{ type: 'text', text: 'Fake AI generated text' }],
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
            documentLogUuid: expect.any(String),
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
              streamType: 'text',
              text: 'Fake AI generated text',
              toolCalls: [],
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              providerLog: logs[logs.length - 1],
              documentLogUuid: expect.any(String),
            },
          },
        },
      ])
    })

    it('calls publisher with correct data', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const parameters = { testParam: 'testValue' }
      const { response, duration } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters,
        source: LogSources.API,
      }).then((r) => r.unwrap())

      // Wait for the response promise to resolve
      await response
      await duration

      expect(publisher.publishLater).toHaveBeenCalled()
    })

    it('creates a document log', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const { response } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())

      await response

      expect(createDocumentLogSpy).toHaveResolvedWith(expect.any(Ok))
    })

    it('creates a document log with custom identifier', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const parameters = { testParam: 'testValue' }
      const { response } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters,
        customIdentifier: 'custom-identifier',
        source: LogSources.API,
      }).then((r) => r.unwrap())

      // Wait for the response promise to resolve
      await response

      expect(createDocumentLogSpy).toHaveResolvedWith(expect.any(Ok))
      expect(
        createDocumentLogSpy.mock.calls[
          createDocumentLogSpy.mock.calls.length - 1
        ]![0].data.customIdentifier,
      ).toEqual('custom-identifier')
    })
  })
})
