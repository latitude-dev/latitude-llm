import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LogSources, Providers, StreamEventTypes } from '../../browser'
import { publisher } from '../../events/publisher'
import { ProviderLogsRepository } from '../../repositories'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '../../tests/factories'
import { testConsumeStream } from '../../tests/helpers'
import { runDocumentAtCommit } from './index'
import { ChainEventTypes } from '@latitude-data/constants'
import { Ok } from './../../lib/Result'
import { Result } from './../../lib/Result'
import { UnprocessableEntityError } from './../../lib/errors'
import { APICallError, RetryError } from 'ai'

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
      text: Promise.resolve('Fake AI generated text'),
      providerLog: Promise.resolve({ uuid: 'fake-provider-log-uuid' }),
      usage: Promise.resolve({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }),
      toolCalls: Promise.resolve([]),
      fullStream,
    })
  }),
}

const dummyDoc1Content = `
---
provider: openai
model: gpt-4o
---

<step>
  This is a test document
</step>
<step>
  With two steps
</step>
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
      const { lastResponse, duration, resolvedContent } =
        await runDocumentAtCommit({
          workspace,
          document,
          commit,
          parameters: {},
          source: LogSources.API,
        }).then((r) => r.unwrap())

      await lastResponse
      await duration

      expect(resolvedContent.trim()).toEqual(`---
provider: openai
model: gpt-4o
---


<step>
  This is a test document
</step>
<step>
  With two steps
</step>`)
    })

    it('pass params to AI', async () => {
      const { workspace, document, commit, provider } = await buildData({
        doc1Content: dummyDoc1Content,
      })

      const { lastResponse } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())

      await lastResponse // wait for the chain to finish

      expect(aiSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: 'This is a test document',
                  _promptlSourceMap: [],
                },
              ],
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
      const { lastResponse, duration, stream } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())

      await lastResponse
      await duration

      const { value } = await testConsumeStream(stream)
      const repo = new ProviderLogsRepository(workspace.id)
      const logs = await repo.findAll().then((r) => r.unwrap())

      expect(value).toEqual(
        expect.arrayContaining([
          {
            event: StreamEventTypes.Latitude,
            data: expect.objectContaining({
              type: ChainEventTypes.ChainStarted,
            }),
          },
          {
            event: StreamEventTypes.Latitude,
            data: expect.objectContaining({
              type: ChainEventTypes.ProviderCompleted,
              providerLogUuid: logs[0]!.uuid,
            }),
          },
          {
            event: StreamEventTypes.Latitude,
            data: expect.objectContaining({
              type: ChainEventTypes.ProviderCompleted,
              providerLogUuid: logs[0]!.uuid,
            }),
          },
          {
            event: StreamEventTypes.Latitude,
            data: expect.objectContaining({
              type: ChainEventTypes.ProviderCompleted,
              providerLogUuid: logs[1]!.uuid,
            }),
          },
        ]),
      )

      expect(value.at(-1)).toEqual({
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ChainCompleted,
          uuid: logs[0]!.documentLogUuid,
          messages: expect.any(Array),
        }),
      })
    })

    it('calls publisher with correct data', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const parameters = { testParam: 'testValue' }
      const { lastResponse, duration } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters,
        source: LogSources.API,
      }).then((r) => r.unwrap())

      // Wait for the lastResponse promise to resolve
      await lastResponse
      await duration

      expect(publisher.publishLater).toHaveBeenCalled()
    })

    it('creates a document log', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const { lastResponse } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
      }).then((r) => r.unwrap())

      await lastResponse

      expect(createDocumentLogSpy).toHaveResolvedWith(expect.any(Ok))
    })

    it('creates a document log with custom identifier', async () => {
      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const parameters = { testParam: 'testValue' }
      const { lastResponse } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters,
        customIdentifier: 'custom-identifier',
        source: LogSources.API,
      }).then((r) => r.unwrap())

      // Wait for the lastResponse promise to resolve
      await lastResponse

      expect(createDocumentLogSpy).toHaveResolvedWith(expect.any(Ok))
      expect(
        createDocumentLogSpy.mock.calls[
          createDocumentLogSpy.mock.calls.length - 1
        ]![0].data.customIdentifier,
      ).toEqual('custom-identifier')
    })

    it('Does not create a document log when rate limited', async () => {
      const fullStream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'error',
            error: new RetryError({
              message: 'wat',
              reason: 'maxRetriesExceeded',
              errors: [
                new APICallError({
                  statusCode: 429,
                  message: 'wat',
                  url: 'http://localhost:3000',
                  requestBodyValues: {},
                }),
              ],
            }),
          })
          controller.close()
        },
      })

      mocks.runAi.mockResolvedValueOnce(
        Result.ok({
          type: 'text',
          text: Promise.resolve('Fake AI generated text'),
          providerLog: Promise.resolve({ uuid: 'fake-provider-log-uuid' }),
          usage: Promise.resolve({
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          }),
          toolCalls: Promise.resolve([]),
          fullStream,
        }),
      )

      const { workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const parameters = { testParam: 'testValue' }
      const { lastResponse } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters,
        customIdentifier: 'custom-identifier',
        source: LogSources.API,
      }).then((r) => r.unwrap())

      // Wait for the lastResponse promise to resolve
      await lastResponse

      expect(createDocumentLogSpy).not.toHaveBeenCalled()
    })
  })
})
