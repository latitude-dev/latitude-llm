import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChainEventTypes } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Providers } from '@latitude-data/constants'
import { LogSources, StreamEventTypes } from '../../constants'
import { publisher } from '../../events/publisher'
import { createProject, createTelemetryContext } from '../../tests/factories'
import { testConsumeStream } from '../../tests/helpers'
import { Result } from './../../lib/Result'
import { runDocumentAtCommit } from './index'
import {
  telemetry as realTelemetry,
  type LatitudeTelemetry,
} from '../../telemetry'

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
      response: Promise.resolve({ messages: [] }),
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

  const context = createTelemetryContext({ workspace })
  return {
    context,
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

describe('runDocumentAtCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - we are mocking the function
    aiSpy.mockImplementation(mocks.runAi)
    // @ts-expect-error - we are mocking the function
    publisherSpy.mockImplementation(mocks.publishLater)
  })

  describe('with an existing provider key', () => {
    it('returns document resolvedContent', async () => {
      const { context, workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const { lastResponse, duration, resolvedContent } =
        await runDocumentAtCommit({
          context,
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
      const { context, workspace, document, commit, provider } =
        await buildData({
          doc1Content: dummyDoc1Content,
        })

      const { lastResponse } = await runDocumentAtCommit({
        context,
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
          config: { model: 'gpt-4o', provider: 'openai', maxSteps: 20 },
          provider,
        }),
      )
    })

    it('send documentLogUuid when chain is completed', async () => {
      const { context, workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const { lastResponse, duration, stream, uuid } =
        await runDocumentAtCommit({
          context,
          workspace,
          document,
          commit,
          parameters: {},
          source: LogSources.API,
        }).then((r) => r.unwrap())

      await lastResponse
      await duration

      const { value } = await testConsumeStream(stream)

      const chainStarted = value.find(
        (e) => e.data.type === ChainEventTypes.ChainStarted,
      )
      expect(chainStarted?.event).toBe(StreamEventTypes.Latitude)
      expect(chainStarted?.data.type).toBe(ChainEventTypes.ChainStarted)

      const providerCompleted = value.find(
        (e) => e.data.type === ChainEventTypes.ProviderCompleted,
      )
      expect(providerCompleted?.event).toBe(StreamEventTypes.Latitude)
      expect(providerCompleted?.data.type).toBe(
        ChainEventTypes.ProviderCompleted,
      )

      expect(value.at(-1)).toEqual({
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ChainCompleted,
          uuid,
          messages: expect.any(Array),
        }),
      })
    })

    it('calls publisher with correct data', async () => {
      const { context, workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const parameters = { testParam: 'testValue' }
      const { lastResponse, duration } = await runDocumentAtCommit({
        context,
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

    it('calls telemetry.span.prompt with all required parameters', async () => {
      const { context, workspace, document, commit, project } = await buildData(
        {
          doc1Content: dummyDoc1Content,
        },
      )

      const mockPrompt = vi
        .fn()
        .mockImplementation(realTelemetry.span.prompt.bind(realTelemetry.span))
      const mockTelemetry = {
        ...realTelemetry,
        span: {
          ...realTelemetry.span,
          prompt: mockPrompt,
        },
      } as unknown as LatitudeTelemetry

      const parameters = { testParam: 'testValue' }
      const customIdentifier = 'test-custom-id'
      const testDeploymentId = 456

      const { lastResponse } = await runDocumentAtCommit(
        {
          context,
          workspace,
          document,
          commit,
          parameters,
          customIdentifier,
          testDeploymentId,
          source: LogSources.API,
        },
        mockTelemetry,
      ).then((r) => r.unwrap())

      await lastResponse

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          documentLogUuid: expect.any(String),
          name: document.path.split('/').at(-1),
          parameters,
          promptUuid: document.documentUuid,
          template: expect.any(String),
          versionUuid: commit.uuid,
          projectId: project.id,
          source: LogSources.API,
          externalId: customIdentifier,
          testDeploymentId,
        }),
        context,
      )
    })

    it('handles rate limit errors', async () => {
      const streamAIResponseSpy = vi.spyOn(
        await import('../../lib/streamManager/step/streamAIResponse'),
        'streamAIResponse',
      )

      streamAIResponseSpy.mockRejectedValueOnce(
        new ChainError({
          code: RunErrorCodes.RateLimit,
          message: 'Rate limit exceeded',
        }),
      )

      const { context, workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })
      const parameters = { testParam: 'testValue' }
      const { lastResponse } = await runDocumentAtCommit({
        context,
        workspace,
        document,
        commit,
        parameters,
        customIdentifier: 'custom-identifier',
        source: LogSources.API,
      }).then((r) => r.unwrap())

      // Wait for the lastResponse promise to resolve
      await lastResponse

      // Restore the spy
      streamAIResponseSpy.mockRestore()
    })
  })

  describe('with userMessage', () => {
    it('injects userMessage into the prompt', async () => {
      const { context, workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })

      const userMessage = 'Please answer in French'
      const { lastResponse } = await runDocumentAtCommit({
        context,
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
        userMessage,
      }).then((r) => r.unwrap())

      await lastResponse // wait for the chain to finish

      // Verify that AI was called and the user message was included in one of the calls
      expect(aiSpy).toHaveBeenCalled()

      // Check if any AI call includes the user message
      const calls = aiSpy.mock.calls
      let foundUserMessage = false

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      calls.forEach((call: any) => {
        const messages = call[0].messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userMessages = messages.filter((msg: any) => msg.role === 'user')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userMessages.forEach((msg: any) => {
          if (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            msg.content.some(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (content: any) =>
                content.text &&
                content.text.includes('Please answer in French'),
            )
          ) {
            foundUserMessage = true
          }
        })
      })

      expect(foundUserMessage).toBe(true)
    })

    it('works without userMessage', async () => {
      const { context, workspace, document, commit } = await buildData({
        doc1Content: dummyDoc1Content,
      })

      const { lastResponse } = await runDocumentAtCommit({
        context,
        workspace,
        document,
        commit,
        parameters: {},
        source: LogSources.API,
        // No userMessage provided
      }).then((r) => r.unwrap())

      await lastResponse // wait for the chain to finish

      // Verify that AI was called but no extra user messages were added
      expect(aiSpy).toHaveBeenCalled()

      // Check that no calls include our test user messages
      const calls = aiSpy.mock.calls
      let foundExtraUserMessage = false

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      calls.forEach((call: any) => {
        const messages = call[0].messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userMessages = messages.filter((msg: any) => msg.role === 'user')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userMessages.forEach((msg: any) => {
          if (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            msg.content.some(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (content: any) =>
                content.text &&
                (content.text.includes('Please answer in French') ||
                  content.text.includes('Please respond in Spanish')),
            )
          ) {
            foundExtraUserMessage = true
          }
        })
      })

      expect(foundExtraUserMessage).toBe(false)
    })
  })
})
