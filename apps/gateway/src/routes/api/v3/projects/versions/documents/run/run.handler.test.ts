import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import {
  ChainError,
  LatitudeError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
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
import {
  LegacyChainEventTypes,
  LogSources,
  StreamEventTypes,
} from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { estimateCost } from '@latitude-data/core/services/ai/estimateCost/index'
import { Providers } from '@latitude-data/constants'
import { createProviderLog } from '@latitude-data/core/factories'

const MODEL = 'gpt-4o'

const mocks = vi.hoisted(() => ({
  runDocumentAtCommit: vi.fn(),
  captureExceptionMock: vi.fn(),
  enqueueRun: vi.fn(),
  isFeatureEnabledByName: vi.fn(),
  findActiveForCommit: vi.fn(),
  getCommitById: vi.fn(),
  routeRequest: vi.fn(),
  queues: {
    defaultQueue: {
      jobs: {
        enqueueCreateProviderLogJob: vi.fn(),
        enqueueCreateDocumentLogJob: vi.fn(),
      },
    },
  },
}))

vi.mock('$/common/tracer', async (importOriginal) => {
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

vi.mock('@latitude-data/core/services/runs/enqueue', () => ({
  enqueueRun: mocks.enqueueRun,
}))

vi.mock(
  '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName',
  () => ({
    isFeatureEnabledByName: mocks.isFeatureEnabledByName,
  }),
)

vi.mock('@latitude-data/core/repositories/deploymentTestsRepository', () => ({
  DeploymentTestsRepository: vi.fn().mockImplementation(() => ({
    findActiveForCommit: mocks.findActiveForCommit,
  })),
}))

vi.mock('@latitude-data/core/repositories/commitsRepository', () => ({
  CommitsRepository: vi.fn().mockImplementation(() => ({
    getCommitById: mocks.getCommitById,
  })),
}))

vi.mock('@latitude-data/core/services/deploymentTests/routeRequest', () => ({
  routeRequest: mocks.routeRequest,
}))

let route: string
let body: string
let token: string
let headers: Record<string, string>
let project: Project
let workspace: Workspace
let commit: Commit
let provider: ProviderApiKey

describe('POST /run', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v3/projects/1/versions/asldkfjhsadl/documents/run',
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

      // Set default mocks for feature flags
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })
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
        userMessage: undefined,
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

      let { done, value } = await testConsumeStream(res.body as ReadableStream)
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
      const {
        workspace: wsp,
        user,
        project: prj,
        providers,
      } = await createProject({
        providers: [
          {
            type: Providers.OpenAI,
            name: 'openai',
            defaultModel: MODEL,
          },
        ],
      })
      project = prj
      workspace = wsp
      provider = providers[0]!
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

      // Set default mocks for feature flags
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })
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
        userMessage: undefined,
      })
    })

    it('returns response', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const usage = {
        promptTokens: 4,
        completionTokens: 6,
        totalTokens: 10,
        inputTokens: 4,
        outputTokens: 6,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      }

      await createProviderLog({
        documentLogUuid,
        workspace,
        providerId: provider.id,
        providerType: provider.provider,
        model: MODEL,
        messages: [
          {
            role: MessageRole.assistant,
            toolCalls: [],
            content: 'Hello',
          },
        ],
        tokens: usage.totalTokens,
      })

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
        usage,
        documentLogUuid,
        providerLog: {
          providerId: provider.id,
          model: MODEL,
          messages: [
            {
              role: MessageRole.assistant,
              toolCalls: [],
              content: 'Hello',
            },
          ],
        },
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

      const expectedCost = estimateCost({
        provider: provider.provider,
        model: MODEL,
        usage,
      })

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        uuid: documentLogUuid,
        conversation: [
          {
            role: MessageRole.assistant,
            toolCalls: [],
            content: 'Hello',
          },
        ],
        response: {
          streamType: 'object',
          usage,
          text: 'Hello',
          object: { something: { else: 'here' } },
          toolCalls: [],
          cost: expectedCost,
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
          providerId: provider.id,
          model: MODEL,
          messages: [
            {
              role: MessageRole.assistant,
              toolCalls: [],
              content: 'Hello',
            },
          ],
        },
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
        providerLog: {
          providerId: provider.id,
          model: MODEL,
          messages: undefined,
        },
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

      // Set default mocks for feature flags
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })
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
        userMessage: undefined,
        source: LogSources.API,
        abortSignal: expect.anything(),
      })
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
        userMessage: undefined,
        tools: {},
        source: LogSources.API,
        abortSignal: expect.anything(),
      })
    })
  })

  describe('background execution with feature flag', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user,
        project: prj,
        providers,
      } = await createProject({
        providers: [
          {
            type: Providers.OpenAI,
            name: 'openai',
            defaultModel: MODEL,
          },
        ],
      })
      project = prj
      workspace = wsp
      provider = providers[0]!
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
      mocks.enqueueRun.mockClear()
      mocks.isFeatureEnabledByName.mockClear()
    })

    it('runs in background when background=true is explicitly set', async () => {
      // Mock feature flag for api-background-runs
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.enqueueRun.mockReturnValue(
        Promise.resolve(
          Result.ok({
            run: { uuid: 'test-run-uuid' },
          }),
        ),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: {},
          background: true,
        }),
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ uuid: 'test-run-uuid' })
      expect(mocks.enqueueRun).toHaveBeenCalled()
      expect(mocks.runDocumentAtCommit).not.toHaveBeenCalled()
    })

    it('runs in foreground when background=false is explicitly set, even with feature flag enabled', async () => {
      // Mock feature flag: api-background-runs enabled but background explicitly false
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(true))
        }
        return Promise.resolve(Result.ok(false))
      })

      const documentLogUuid = generateUUIDIdentifier()
      const usage = {
        promptTokens: 4,
        completionTokens: 6,
        totalTokens: 10,
        inputTokens: 4,
        outputTokens: 6,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      }

      await createProviderLog({
        documentLogUuid,
        workspace,
        providerId: provider.id,
        providerType: provider.provider,
        model: MODEL,
        messages: [
          { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
        ],
        tokens: usage.totalTokens,
      })

      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const lastResponse = Promise.resolve({
        streamType: 'text',
        text: 'Hello',
        usage,
        documentLogUuid,
        providerLog: {
          providerId: provider.id,
          model: MODEL,
          messages: [
            { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
          ],
        },
      })
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

      const expectedCost = estimateCost({
        provider: provider.provider,
        model: MODEL,
        usage,
      })

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: {},
          background: false,
        }),
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        uuid: documentLogUuid,
        conversation: [
          { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
        ],
        response: {
          streamType: 'text',
          usage,
          text: 'Hello',
          cost: expectedCost,
        },
      })
      expect(mocks.runDocumentAtCommit).toHaveBeenCalled()
      expect(mocks.enqueueRun).not.toHaveBeenCalled()
    })

    it('runs in background when feature flag is enabled and background param is undefined', async () => {
      // Clear previous mocks and set up new ones
      mocks.runDocumentAtCommit.mockClear()
      mocks.enqueueRun.mockClear()

      // Mock feature flag: api-background-runs enabled, background not specified
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(true))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.enqueueRun.mockImplementation(() => {
        return Promise.resolve(
          Result.ok({
            run: { uuid: 'test-run-uuid' },
          }),
        )
      })

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: {},
          // background is undefined
        }),
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ uuid: 'test-run-uuid' })
      expect(mocks.enqueueRun).toHaveBeenCalled()
      expect(mocks.runDocumentAtCommit).not.toHaveBeenCalled()
    })

    it('runs in foreground when feature flag is disabled and background param is undefined', async () => {
      // Mock feature flag: api-background-runs disabled, background not specified
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      const documentLogUuid = generateUUIDIdentifier()
      const usage = {
        promptTokens: 4,
        completionTokens: 6,
        totalTokens: 10,
        inputTokens: 4,
        outputTokens: 6,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      }

      await createProviderLog({
        documentLogUuid,
        workspace,
        providerId: provider.id,
        providerType: provider.provider,
        model: MODEL,
        messages: [
          { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
        ],
        tokens: usage.totalTokens,
      })

      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const lastResponse = Promise.resolve({
        streamType: 'text',
        text: 'Hello',
        usage,
        documentLogUuid,
        providerLog: {
          providerId: provider.id,
          model: MODEL,
          messages: [
            { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
          ],
        },
      })
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

      const expectedCost = estimateCost({
        provider: provider.provider,
        model: MODEL,
        usage,
      })

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: {},
          // background is undefined
        }),
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        uuid: documentLogUuid,
        conversation: [
          { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
        ],
        response: {
          streamType: 'text',
          usage,
          text: 'Hello',
          cost: expectedCost,
        },
      })
      expect(mocks.runDocumentAtCommit).toHaveBeenCalled()
      expect(mocks.enqueueRun).not.toHaveBeenCalled()
    })
  })

  describe('deployment test routing', () => {
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

      // Reset all mocks
      mocks.runDocumentAtCommit.mockClear()
      mocks.enqueueRun.mockClear()
      mocks.findActiveForCommit.mockClear()
      mocks.getCommitById.mockClear()
      mocks.routeRequest.mockClear()

      // Set default mocks
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.findActiveForCommit.mockResolvedValue(undefined)
    })

    describe('with shadow test', () => {
      it('should execute baseline run with shadow test context', async () => {
        const shadowTest = {
          id: 1,
          uuid: 'test-uuid',
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: 'doc-uuid',
          challengerCommitId: 999,
          testType: 'shadow',
          trafficPercentage: 100,
          status: 'running',
        }

        mocks.findActiveForCommit.mockResolvedValue(shadowTest)

        const documentLogUuid = generateUUIDIdentifier()
        const usage = {
          promptTokens: 4,
          completionTokens: 6,
          totalTokens: 10,
          inputTokens: 4,
          outputTokens: 6,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        }

        await createProviderLog({
          documentLogUuid,
          workspace,
          providerId: provider.id,
          providerType: provider.provider,
          model: MODEL,
          messages: [
            { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
          ],
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runDocumentAtCommit.mockReturnValue(
          Promise.resolve(
            Result.ok({
              stream,
              lastResponse: Promise.resolve({
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                providerLog: {
                  providerId: provider.id,
                  model: MODEL,
                  messages: [
                    {
                      role: MessageRole.assistant,
                      content: 'Hello',
                      toolCalls: [],
                    },
                  ],
                },
              }),
            }),
          ),
        )

        const res = await app.request(route, {
          method: 'POST',
          body,
          headers,
        })

        expect(res.status).toBe(200)
        expect(mocks.runDocumentAtCommit).toHaveBeenCalled()
        // Should use original commit for baseline
        expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            commit: expect.objectContaining({ id: commit.id }),
          }),
        )
      })
    })

    describe('with A/B test', () => {
      let challengerCommit: Commit

      beforeEach(async () => {
        const { commit: newCommit } = await createDraft({
          project,
          user: {} as any,
        })
        challengerCommit = await mergeCommit(newCommit).then((r) => r.unwrap())
      })

      it('should route to baseline when routeRequest returns baseline', async () => {
        const abTest = {
          id: 1,
          uuid: 'test-uuid',
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: 'doc-uuid',
          challengerCommitId: challengerCommit.id,
          testType: 'ab',
          trafficPercentage: 50,
          status: 'running',
        }

        mocks.findActiveForCommit.mockResolvedValue(abTest)
        mocks.routeRequest.mockReturnValue('baseline')

        const documentLogUuid = generateUUIDIdentifier()
        const usage = {
          promptTokens: 4,
          completionTokens: 6,
          totalTokens: 10,
          inputTokens: 4,
          outputTokens: 6,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        }

        await createProviderLog({
          documentLogUuid,
          workspace,
          providerId: provider.id,
          providerType: provider.provider,
          model: MODEL,
          messages: [
            { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
          ],
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runDocumentAtCommit.mockReturnValue(
          Promise.resolve(
            Result.ok({
              stream,
              lastResponse: Promise.resolve({
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                providerLog: {
                  providerId: provider.id,
                  model: MODEL,
                  messages: [
                    {
                      role: MessageRole.assistant,
                      content: 'Hello',
                      toolCalls: [],
                    },
                  ],
                },
              }),
            }),
          ),
        )

        const res = await app.request(route, {
          method: 'POST',
          body: JSON.stringify({
            path: 'path/to/document',
            parameters: {},
            customIdentifier: 'user-123',
          }),
          headers,
        })

        expect(res.status).toBe(200)
        expect(mocks.routeRequest).toHaveBeenCalledWith(abTest, 'user-123')
        expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            source: LogSources.API,
            commit: expect.objectContaining({ id: commit.id }),
          }),
        )
      })

      it('should route to challenger when routeRequest returns challenger', async () => {
        const abTest = {
          id: 1,
          uuid: 'test-uuid',
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: 'doc-uuid',
          challengerCommitId: challengerCommit.id,
          testType: 'ab',
          trafficPercentage: 50,
          status: 'running',
        }

        mocks.findActiveForCommit.mockResolvedValue(abTest)
        mocks.routeRequest.mockReturnValue('challenger')
        mocks.getCommitById.mockResolvedValue(Result.ok(challengerCommit))

        const documentLogUuid = generateUUIDIdentifier()
        const usage = {
          promptTokens: 4,
          completionTokens: 6,
          totalTokens: 10,
          inputTokens: 4,
          outputTokens: 6,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        }

        await createProviderLog({
          documentLogUuid,
          workspace,
          providerId: provider.id,
          providerType: provider.provider,
          model: MODEL,
          messages: [
            { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
          ],
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runDocumentAtCommit.mockReturnValue(
          Promise.resolve(
            Result.ok({
              stream,
              lastResponse: Promise.resolve({
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                providerLog: {
                  providerId: provider.id,
                  model: MODEL,
                  messages: [
                    {
                      role: MessageRole.assistant,
                      content: 'Hello',
                      toolCalls: [],
                    },
                  ],
                },
              }),
            }),
          ),
        )

        const res = await app.request(route, {
          method: 'POST',
          body: JSON.stringify({
            path: 'path/to/document',
            parameters: {},
            customIdentifier: 'user-456',
          }),
          headers,
        })

        expect(res.status).toBe(200)
        expect(mocks.routeRequest).toHaveBeenCalledWith(abTest, 'user-456')
        expect(mocks.getCommitById).toHaveBeenCalledWith(challengerCommit.id)
        expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            source: LogSources.ABTestChallenger,
            commit: expect.objectContaining({ id: challengerCommit.id }),
          }),
        )
      })

      it('should work without custom identifier for A/B test', async () => {
        const abTest = {
          id: 1,
          uuid: 'test-uuid',
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: 'doc-uuid',
          challengerCommitId: challengerCommit.id,
          testType: 'ab',
          trafficPercentage: 50,
          status: 'running',
        }

        mocks.findActiveForCommit.mockResolvedValue(abTest)
        mocks.routeRequest.mockReturnValue('baseline')

        const documentLogUuid = generateUUIDIdentifier()
        const usage = {
          promptTokens: 4,
          completionTokens: 6,
          totalTokens: 10,
          inputTokens: 4,
          outputTokens: 6,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        }

        await createProviderLog({
          documentLogUuid,
          workspace,
          providerId: provider.id,
          providerType: provider.provider,
          model: MODEL,
          messages: [
            { role: MessageRole.assistant, content: 'Hello', toolCalls: [] },
          ],
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runDocumentAtCommit.mockReturnValue(
          Promise.resolve(
            Result.ok({
              stream,
              lastResponse: Promise.resolve({
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                providerLog: {
                  providerId: provider.id,
                  model: MODEL,
                  messages: [
                    {
                      role: MessageRole.assistant,
                      content: 'Hello',
                      toolCalls: [],
                    },
                  ],
                },
              }),
            }),
          ),
        )

        const res = await app.request(route, {
          method: 'POST',
          body: JSON.stringify({
            path: 'path/to/document',
            parameters: {},
          }),
          headers,
        })

        expect(res.status).toBe(200)
        expect(mocks.routeRequest).toHaveBeenCalledWith(abTest, undefined)
      })
    })

    describe('with background runs and deployment tests', () => {
      it('should enqueue background run with shadow test context', async () => {
        const shadowTest = {
          id: 1,
          uuid: 'test-uuid',
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: 'doc-uuid',
          challengerCommitId: 999,
          testType: 'shadow',
          trafficPercentage: 100,
          status: 'running',
        }

        mocks.findActiveForCommit.mockResolvedValue(shadowTest)
        mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
          if (featureName === 'api-background-runs') {
            return Promise.resolve(Result.ok(true))
          }
          return Promise.resolve(Result.ok(false))
        })

        mocks.enqueueRun.mockReturnValue(
          Promise.resolve(
            Result.ok({
              run: { uuid: 'test-run-uuid' },
            }),
          ),
        )

        const res = await app.request(route, {
          method: 'POST',
          body,
          headers,
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ uuid: 'test-run-uuid' })
        expect(mocks.enqueueRun).toHaveBeenCalledWith(
          expect.objectContaining({
            activeDeploymentTest: shadowTest,
          }),
        )
      })
    })
  })
})
