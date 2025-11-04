import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import {
  ChainError,
  LatitudeError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createProject,
  createTelemetryTrace,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '$/routes/app'
import { ChainEventTypes } from '@latitude-data/constants'
import { parseSSEvent } from '$/common/parseSSEEvent'
import {
  ChainStepResponse,
  LegacyChainEventTypes,
  LogSources,
  StreamEventTypes,
} from '@latitude-data/core/constants'
import { ProviderLog } from '@latitude-data/core/schema/models/types/ProviderLog'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

const mocks = vi.hoisted(() => ({
  addMessages: vi.fn(),
  captureException: vi.fn(),
  queues: {
    defaultQueue: {
      jobs: {},
    },
  },
}))

vi.mock(
  '@latitude-data/core/services/documentLogs/addMessages/index',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal

    return {
      ...original,
      addMessages: mocks.addMessages,
    }
  },
)

vi.mock('$/common/tracer', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal

  return {
    ...original,
    captureException: mocks.captureException,
  }
})

vi.mock('$/jobs', () => ({
  queues: mocks.queues,
}))

let token: string
let route: string
let body: Record<string, any>
let headers: Record<string, string>
let workspace: Workspace
const step: ChainStepResponse<'text'> = {
  streamType: 'text',
  text: 'fake-response-text',
  reasoning: undefined,
  usage: {
    inputTokens: 4,
    outputTokens: 6,
    promptTokens: 4,
    completionTokens: 6,
    totalTokens: 10,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  },
  toolCalls: [],
  documentLogUuid: 'fake-document-log-uuid',
  providerLog: {
    messages: [
      {
        role: MessageRole.assistant,
        toolCalls: [],
        content: 'fake-assistant-content',
      },
    ],
  } as unknown as ProviderLog,
}

describe('POST /chat', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        `/api/v3/conversations/${step.documentLogUuid}/chat`,
        {
          method: 'POST',
          body: JSON.stringify({
            stream: true,
            messages: [
              {
                role: MessageRole.user,
                content: 'fake-user-content',
              },
            ],
          }),
        },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized with stream', () => {
    beforeEach(async () => {
      mocks.addMessages.mockClear()

      const project = await createProject()
      workspace = project.workspace
      const apikey = (
        await unsafelyGetFirstApiKeyByWorkspaceId({
          workspaceId: workspace.id,
        })
      ).unwrap()

      token = apikey.token
      route = `/api/v3/conversations/${step.documentLogUuid}/chat`
      body = {
        stream: true,
        messages: [
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'fake-user-content',
              },
            ],
          },
        ],
      }
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Latitude-SDK-Version': '5.0.0',
      }
    })

    it('stream succeeds', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ProviderCompleted,
                      response: step,
                    },
                  })
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ChainCompleted,
                      messages: step.providerLog?.messages,
                    },
                  })
                  controller.close()
                },
              }),
              response: new Promise((resolve) => resolve(Result.ok({}))),
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      let { done, value } = await testConsumeStream(res.body as ReadableStream)
      const event = parseSSEvent(value!)

      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
      expect(event).toEqual({
        id: 1,
        event: StreamEventTypes.Latitude,
        data: {
          type: ChainEventTypes.ChainCompleted,
          messages: step.providerLog?.messages,
        },
      })
    })

    it('calls chat provider', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ProviderCompleted,
                      response: step,
                    },
                  })
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ChainCompleted,
                      messages: step.providerLog?.messages,
                    },
                  })
                  controller.close()
                },
              }),
              response: new Promise((resolve) => resolve(Result.ok({}))),
              trace,
            }),
          )
        }),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        documentLogUuid: step.documentLogUuid,
        messages: body.messages,
        source: LogSources.API,
        tools: {},
        abortSignal: expect.anything(),
      })
    })

    it('passes SDK version header to addMessages', async () => {
      const trace = createTelemetryTrace({})
      const sdkVersion = '5.1.0'

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ProviderCompleted,
                      response: step,
                    },
                  })
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ChainCompleted,
                      messages: step.providerLog?.messages,
                    },
                  })
                  controller.close()
                },
              }),
              response: new Promise((resolve) => resolve(Result.ok({}))),
              trace,
            }),
          )
        }),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          ...headers,
          'X-Latitude-SDK-Version': sdkVersion,
        },
      })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        documentLogUuid: step.documentLogUuid,
        messages: body.messages,
        source: LogSources.API,
        tools: {},
        abortSignal: expect.anything(),
      })
    })

    it('uses source from __internal', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ProviderCompleted,
                      response: step,
                    },
                  })
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ChainCompleted,
                      messages: step.providerLog?.messages,
                    },
                  })
                  controller.close()
                },
              }),
              response: new Promise((resolve) => resolve(Result.ok({}))),
              trace,
            }),
          )
        }),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          __internal: { source: LogSources.Playground },
          ...body,
        }),
        headers,
      })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        documentLogUuid: step.documentLogUuid,
        messages: body.messages,
        tools: {},
        source: LogSources.Playground,
        abortSignal: expect.anything(),
      })
    })

    it('returns error when addMessages has an error', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({
                    event: StreamEventTypes.Latitude,
                    data: {
                      type: ChainEventTypes.ChainError,
                      error: new ChainError({
                        code: RunErrorCodes.AIRunError,
                        message: 'API call error',
                      }),
                    },
                  })
                  controller.close()
                },
              }),
              response: new Promise((resolve) => resolve(Result.ok({}))),
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      let { done, value } = await testConsumeStream(res.body as ReadableStream)
      const event = parseSSEvent(value!)

      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
      expect(event).toEqual({
        id: 0,
        event: StreamEventTypes.Latitude,
        data: {
          type: LegacyChainEventTypes.Error,
          error: {
            details: {
              errorCode: RunErrorCodes.AIRunError,
            },
            errorCode: RunErrorCodes.AIRunError,
            headers: {},
            name: 'UnprocessableEntityError',
            statusCode: 422,
          },
        },
      })
      expect(mocks.captureException).not.toHaveBeenCalled()
    })
  })

  describe('authorized without stream', () => {
    beforeEach(async () => {
      mocks.captureException.mockClear()
      mocks.addMessages.mockClear()

      const project = await createProject()
      workspace = project.workspace
      const apikey = (
        await unsafelyGetFirstApiKeyByWorkspaceId({
          workspaceId: workspace.id,
        })
      ).unwrap()

      token = apikey.token
      route = `/api/v3/conversations/${step.documentLogUuid}/chat`
      body = {
        stream: false,
        messages: [
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'fake-user-content',
              },
            ],
          },
        ],
      }
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Latitude-SDK-Version': '5.0.0',
      }
    })

    it('returns response', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({}),
              response: Promise.resolve(step),
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        uuid: step.documentLogUuid,
        conversation: step.providerLog?.messages,
        response: {
          streamType: step.streamType,
          text: step.text,
          usage: step.usage,
          toolCalls: step.toolCalls,
        },
      })
    })

    it('calls chat provider', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({}),
              response: new Promise((resolve) => {
                resolve(Result.ok(step))
              }),
              trace,
            }),
          )
        }),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        documentLogUuid: step.documentLogUuid,
        messages: body.messages,
        source: LogSources.API,
        tools: {},
        abortSignal: expect.anything(),
      })
    })

    it('uses source from __internal', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({}),
              response: new Promise((resolve) => {
                resolve(Result.ok(step))
              }),
              trace,
            }),
          )
        }),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          __internal: { source: LogSources.Playground },
          ...body,
        }),
        headers,
      })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        documentLogUuid: step.documentLogUuid,
        messages: body.messages,
        source: LogSources.Playground,
        tools: {},
        abortSignal: expect.anything(),
      })
    })

    it('returns error when addMessages has an error', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({}),
              error: Promise.resolve(
                new ChainError({
                  code: RunErrorCodes.AIRunError,
                  message: 'API call error',
                }),
              ),
              response: Promise.resolve(undefined),
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      expect(mocks.queues)
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({
        name: 'DocumentRunError',
        errorCode: RunErrorCodes.AIRunError,
        message: 'API call error',
        details: {
          errorCode: RunErrorCodes.AIRunError,
        },
      })
      expect(mocks.captureException).not.toHaveBeenCalled()
    })

    it('returns error when no documentLogUuid in documentRunPresenter', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({}),
              response: Promise.resolve({
                ...step,
                documentLogUuid: undefined,
              }),
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      expect(mocks.queues)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({
        name: 'LatitudeError',
        errorCode: 'LatitudeError',
        message: 'Document Log uuid not found in response',
        details: {},
      })
      expect(mocks.captureException).toHaveBeenCalledWith(
        new LatitudeError('Document Log uuid not found in response'),
      )
    })

    it('returns error when no providerLog in documentRunPresenter', async () => {
      const trace = createTelemetryTrace({})

      mocks.addMessages.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream: new ReadableStream({}),
              response: Promise.resolve({
                ...step,
                providerLog: undefined,
              }),
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      })

      expect(mocks.queues)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({
        name: 'LatitudeError',
        errorCode: 'LatitudeError',
        message: 'Conversation messages not found in response',
        details: {},
      })
      expect(mocks.captureException).toHaveBeenCalledWith(
        new LatitudeError('Conversation messages not found in response'),
      )
    })
  })
})
