import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { ContentType, MessageRole } from '@latitude-data/compiler'
import {
  ChainError,
  LatitudeError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import {
  LegacyChainEventTypes,
  Commit,
  LogSources,
  Project,
  ProviderLog,
  StreamEventTypes,
  Workspace,
} from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChainEventTypes } from '@latitude-data/constants'

const mocks = vi.hoisted(() => ({
  runDocumentAtCommit: vi.fn(),
  captureExceptionMock: vi.fn(),
  queues: {
    defaultQueue: {
      jobs: {
        enqueueCreateProviderLogJob: vi.fn(),
        enqueueCreateDocumentLogJob: vi.fn(),
      },
    },
  },
}))

vi.mock('$/common/sentry', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal

  return {
    ...original,
    captureException: mocks.captureExceptionMock,
  }
})

vi.mock(
  '@latitude-data/core/services/commits/runDocumentAtCommit',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal

    return {
      ...original,
      runDocumentAtCommit: mocks.runDocumentAtCommit,
    }
  },
)

vi.mock('$/jobs', () => ({
  queues: mocks.queues,
}))

let route: string
let body: string
let token: string
let headers: Record<string, string>
let project: Project
let workspace: Workspace
let commit: Commit

describe('POST /run', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v2/projects/1/versions/asldkfjhsadl/documents/run',
        {
          method: 'POST',
          body: JSON.stringify({
            documentPath: 'path/to/document',
          }),
        },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized with stream', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user,
        project: prj,
        providers,
      } = await createProject()
      project = prj
      workspace = wsp
      const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      token = apikey?.token!
      const path = 'path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const document = await createDocumentVersion({
        workspace,
        user,
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v2/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.documentVersion.path,
        parameters: {},
        customIdentifier: 'miau',
        stream: true,
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })

    it('uses source from __internal', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: LegacyChainEventTypes.Complete,
              response: {
                text: 'Hello',
                usage: {},
              },
            },
          })

          controller.close()
        },
      })

      const response = new Promise((resolve) => {
        resolve({ text: 'Hello', usage: {} })
      })

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              response,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: {},
          stream: true,
          __internal: { source: LogSources.Playground },
        }),
        headers,
      })

      await testConsumeStream(res.body as ReadableStream)

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith({
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        source: LogSources.Playground,
      })
    })

    it('stream succeeds', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ProviderCompleted,
              response: {
                text: 'Hello',
                usage: {},
              },
            },
          })
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
            },
          })

          controller.close()
        },
      })

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse: Promise.resolve({ text: 'Hello', usage: {} }),
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      let { done, value } = await testConsumeStream(res.body as ReadableStream)
      const event = parseSSEvent(value)
      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
      expect(event).toEqual({
        id: 0,
        event: StreamEventTypes.Latitude,
        data: {
          type: LegacyChainEventTypes.Complete,
          response: {
            text: 'Hello',
            usage: {},
          },
        },
      })
    })

    it('stream succeeds with tool calls', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ProviderStarted,
              config: {
                tools: {
                  get_the_weather: {
                    description:
                      'Retrieves the current weather for a specified location.',
                    parameters: {
                      type: 'object',
                      properties: {
                        location: {
                          type: 'string',
                          description:
                            "The city and country, e.g., 'Valencia, Spain'.",
                        },
                      },
                      required: ['location'],
                      additionalProperties: false,
                    },
                  },
                },
              },
              messages: [],
            },
          })
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ProviderCompleted,
              response: {
                streamType: 'text',
                text: '',
                usage: {},
                toolCalls: [
                  {
                    id: 'fake-tool-call-id',
                    name: 'get_the_weather',
                    arguments: { location: 'Barcelona, Spain' },
                  },
                ],
                documentLogUuid: 'fake-uuid',
              },
            },
          })
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
              messages: [
                {
                  role: MessageRole.assistant,
                  toolCalls: [
                    {
                      id: 'fake-tool-call-id',
                      name: 'get_the_weather',
                      arguments: { location: 'Barcelona, Spain' },
                    },
                  ],
                  content: [
                    {
                      type: ContentType.toolCall,
                      toolCallId: 'fake-tool-call-id',
                      toolName: 'get_the_weather',
                      args: { location: 'Barcelona, Spain' },
                    },
                  ],
                },
              ],
            },
          })

          controller.close()
        },
      })

      const lastResponse = Promise.resolve({})

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      let { done, value } = await testConsumeStream(res.body as ReadableStream)
      const event = parseSSEvent(value)
      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
      expect(event).toEqual({
        id: expect.any(Number),
        event: StreamEventTypes.Latitude,
        data: {
          type: LegacyChainEventTypes.Complete,
          uuid: 'fake-uuid',
          config: {
            tools: {
              get_the_weather: {
                description:
                  'Retrieves the current weather for a specified location.',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description:
                        "The city and country, e.g., 'Valencia, Spain'.",
                    },
                  },
                  required: ['location'],
                  additionalProperties: false,
                },
              },
            },
          },
          response: {
            streamType: 'text',
            text: '',
            usage: {},
            toolCalls: [
              {
                id: 'fake-tool-call-id',
                name: 'get_the_weather',
                arguments: { location: 'Barcelona, Spain' },
              },
            ],
          },
          messages: [
            {
              role: MessageRole.assistant,
              toolCalls: [
                {
                  id: 'fake-tool-call-id',
                  name: 'get_the_weather',
                  arguments: { location: 'Barcelona, Spain' },
                },
              ],
              content: [
                {
                  type: ContentType.toolCall,
                  toolCallId: 'fake-tool-call-id',
                  toolName: 'get_the_weather',
                  args: { location: 'Barcelona, Spain' },
                },
              ],
            },
          ],
        },
      })
    })
  })

  describe('authorized without stream', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user,
        project: prj,
        providers,
      } = await createProject()
      project = prj
      workspace = wsp
      const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      token = apikey?.token!
      const path = 'path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const document = await createDocumentVersion({
        workspace,
        user,
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v2/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.documentVersion.path,
        parameters: {},
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })

    it('uses source from __internal', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: LegacyChainEventTypes.Complete,
              response: {
                text: 'Hello',
                usage: {},
              },
            },
          })

          controller.close()
        },
      })

      const response = new Promise((resolve) => {
        resolve({ text: 'Hello', usage: {} })
      })

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              response,
            }),
          )
        }),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: {},
          __internal: { source: LogSources.Playground },
        }),
        headers,
      })

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith({
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        source: LogSources.Playground,
      })
    })

    it('returns response', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ProviderCompleted,
              response: {
                text: 'Hello',
                usage: {},
              },
            },
          })
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
            },
          })

          controller.close()
        },
      })

      const lastResponse = Promise.resolve({
        streamType: 'object',
        object: { something: { else: 'here' } },
        text: 'Hello',
        usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
        documentLogUuid: 'fake-document-log-uuid',
        providerLog: {
          messages: [
            {
              role: MessageRole.assistant,
              toolCalls: [],
              content: 'Hello',
            },
          ],
        } as unknown as ProviderLog,
      })

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        uuid: 'fake-document-log-uuid',
        conversation: [
          {
            role: MessageRole.assistant,
            toolCalls: [],
            content: 'Hello',
          },
        ],
        response: {
          streamType: 'object',
          usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
          text: 'Hello',
          object: { something: { else: 'here' } },
          toolCalls: [],
        },
      })
    })

    it('returns error when runDocumentAtCommit has an error', async () => {
      const lastResponse = Promise.resolve(undefined)
      const error = Promise.resolve(
        new ChainError({
          code: RunErrorCodes.ChainCompileError,
          message: 'Error compiling prompt for document uuid',
        }),
      )

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream: new ReadableStream(),
            lastResponse,
            error,
          }),
        ),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({
        name: 'DocumentRunError',
        errorCode: RunErrorCodes.ChainCompileError,
        message: 'Error compiling prompt for document uuid',
        details: {
          errorCode: RunErrorCodes.ChainCompileError,
        },
      })
    })

    it('returns error if runDocumentAtCommit has not documentLogUuid', async () => {
      const lastResponse = Promise.resolve({
        streamType: 'object',
        object: { something: { else: 'here' } },
        text: 'Hello',
        usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
        providerLog: {
          messages: [
            {
              role: MessageRole.assistant,
              toolCalls: [],
              content: 'Hello',
            },
          ],
        } as unknown as ProviderLog,
      })

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream: new ReadableStream(),
            lastResponse,
          }),
        ),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({
        name: 'LatitudeError',
        errorCode: 'LatitudeError',
        message: 'Document Log uuid not found in response',
        details: {},
      })
      expect(mocks.captureExceptionMock).toHaveBeenCalledWith(
        new LatitudeError('Document Log uuid not found in response'),
      )
    })

    it('returns error if runDocumentAtCommit has not providerLog', async () => {
      const lastResponse = Promise.resolve({
        streamType: 'object',
        object: { something: { else: 'here' } },
        text: 'Hello',
        usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
        documentLogUuid: 'fake-document-log-uuid',
      })

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream: new ReadableStream(),
            lastResponse,
          }),
        ),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({
        name: 'LatitudeError',
        errorCode: 'LatitudeError',
        message: 'Conversation messages not found in response',
        details: {},
      })
    })
  })
})
