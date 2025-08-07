import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { ChainError, LatitudeError, RunErrorCodes } from '@latitude-data/constants/errors'
import {
  type Commit,
  LegacyChainEventTypes,
  LogSources,
  type Project,
  type ProviderLog,
  StreamEventTypes,
  type Workspace,
} from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  createTelemetryTrace,
  helpers,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChainEventTypes } from '@latitude-data/constants'

const mocks = vi.hoisted(() => ({
  runDocumentAtCommit: vi.fn(),
  runDocumentAtCommitLegacy: vi.fn(),
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

vi.mock('@latitude-data/core/services/commits/runDocumentAtCommit', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal

  return {
    ...original,
    runDocumentAtCommit: mocks.runDocumentAtCommit,
  }
})

vi.mock(
  '@latitude-data/core/services/__deprecated/commits/runDocumentAtCommit',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal

    return {
      ...original,
      runDocumentAtCommitLegacy: mocks.runDocumentAtCommitLegacy,
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
      const res = await app.request('/api/v3/projects/1/versions/asldkfjhsadl/documents/run', {
        method: 'POST',
        body: JSON.stringify({
          documentPath: 'path/to/document',
        }),
      })

      expect(res.status).toBe(401)
    })
  })

  describe('authorized with stream', () => {
    beforeEach(async () => {
      const { workspace: wsp, user, project: prj, providers } = await createProject()
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

      route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.documentVersion.path,
        parameters: {},
        customIdentifier: 'miau',
        stream: true,
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Latitude-SDK-Version': '5.0.0',
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

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              response,
              trace,
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
        context: expect.anything(),
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        tools: {},
        source: LogSources.Playground,
        abortSignal: expect.anything(),
        isLegacy: false,
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

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse: Promise.resolve({ text: 'Hello', usage: {} }),
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      const { done, value } = await testConsumeStream(res.body as ReadableStream)
      const event = parseSSEvent(value)
      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
      expect(event).toEqual({
        id: 1,
        event: StreamEventTypes.Latitude,
        data: {
          type: ChainEventTypes.ChainCompleted,
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
                    description: 'Retrieves the current weather for a specified location.',
                    parameters: {
                      type: 'object',
                      properties: {
                        location: {
                          type: 'string',
                          description: "The city and country, e.g., 'Valencia, Spain'.",
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
                      type: 'tool-call',
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

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse,
              trace,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      const { done } = await testConsumeStream(res.body as ReadableStream)

      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
    })
  })

  describe('authorized without stream', () => {
    beforeEach(async () => {
      const { workspace: wsp, user, project: prj, providers } = await createProject()
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

      route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.documentVersion.path,
        parameters: {},
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Latitude-SDK-Version': '5.0.0',
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

      const lastResponse = new Promise((resolve) => {
        resolve({ text: 'Hello', usage: {} })
      })

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse,
              trace,
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
        context: expect.anything(),
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        tools: {},
        source: LogSources.Playground,
        abortSignal: expect.anything(),
        isLegacy: false,
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

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse,
              trace,
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

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream: new ReadableStream(),
            lastResponse,
            error,
            trace,
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

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream: new ReadableStream(),
            lastResponse,
            trace,
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

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream: new ReadableStream(),
            lastResponse,
            trace,
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

  describe('version-based routing', () => {
    beforeEach(async () => {
      const { workspace: wsp, user, project: prj, providers } = await createProject()
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

      route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.documentVersion.path,
        parameters: {},
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Latitude-SDK-Version': '5.0.0',
      }

      // Reset mocks
      mocks.runDocumentAtCommit.mockClear()
      mocks.runDocumentAtCommitLegacy.mockClear()
    })

    it('uses new method when SDK version >= 5.0.0', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const lastResponse = Promise.resolve({ text: 'Hello', usage: {} })
      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream,
            lastResponse,
            trace,
          }),
        ),
      )

      await app.request(route, {
        method: 'POST',
        body,
        headers: {
          ...headers,
          'X-Latitude-SDK-Version': '5.0.0',
        },
      })

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        tools: {},
        source: LogSources.API,
        abortSignal: expect.anything(),
        isLegacy: false,
      })
      expect(mocks.runDocumentAtCommitLegacy).not.toHaveBeenCalled()
    })

    it('uses legacy method when SDK version < 5.0.0', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const lastResponse = Promise.resolve({ text: 'Hello', usage: {} })
      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommitLegacy.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream,
            lastResponse,
            trace,
          }),
        ),
      )

      await app.request(route, {
        method: 'POST',
        body,
        headers: {
          ...headers,
          'X-Latitude-SDK-Version': '4.9.0',
        },
      })

      expect(mocks.runDocumentAtCommitLegacy).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        tools: {},
        source: LogSources.API,
        abortSignal: expect.anything(),
        isLegacy: true,
      })
      expect(mocks.runDocumentAtCommit).not.toHaveBeenCalled()
    })

    it('returns tool calls when using legacy sdk and the response has tool calls', async () => {
      const stream = new ReadableStream({
        start(controller) {
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
              toolCalls: [
                {
                  id: 'fake-tool-call-id',
                  name: 'get_the_weather',
                  arguments: { location: 'Barcelona, Spain' },
                },
              ],
              content: 'Hello',
            },
          ],
        } as unknown as ProviderLog,
      })

      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommitLegacy.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream,
            lastResponse,
            trace,
            toolCalls: Promise.resolve([
              {
                id: 'fake-tool-call-id',
                name: 'get_the_weather',
                arguments: { location: 'Barcelona, Spain' },
              },
            ]),
          }),
        ),
      )

      const response = await app.request(route, {
        method: 'POST',
        body,
        headers: {
          ...headers,
          'X-Latitude-SDK-Version': '4.9.0',
        },
      })

      expect(mocks.runDocumentAtCommitLegacy).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        tools: {},
        source: LogSources.API,
        abortSignal: expect.anything(),
        isLegacy: true,
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(
        expect.objectContaining({
          toolRequests: [
            {
              id: 'fake-tool-call-id',
              name: 'get_the_weather',
              arguments: { location: 'Barcelona, Spain' },
            },
          ],
        }),
      )
    })

    it('uses new method when no SDK version header (defaults to latest)', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const lastResponse = Promise.resolve({ text: 'Hello', usage: {} })
      const trace = createTelemetryTrace({})

      mocks.runDocumentAtCommit.mockReturnValue(
        Promise.resolve(
          Result.ok({
            stream,
            lastResponse,
            trace,
          }),
        ),
      )

      await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith({
        context: expect.anything(),
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        tools: {},
        source: LogSources.API,
        abortSignal: expect.anything(),
        isLegacy: false,
      })
      expect(mocks.runDocumentAtCommitLegacy).not.toHaveBeenCalled()
    })
  })
})
