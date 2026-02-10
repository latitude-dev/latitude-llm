import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { Message } from '@latitude-data/constants/messages'
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
  helpers,
  updateDocumentVersion,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChainEventTypes } from '@latitude-data/constants'
import { LogSources, StreamEventTypes } from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { estimateCost } from '@latitude-data/core/services/ai/estimateCost/index'
import { Providers } from '@latitude-data/constants'
import { createProviderLog } from '@latitude-data/core/factories'

const MODEL = 'gpt-4o'

const responseMessages: Message[] = [
  {
    role: 'assistant',
    toolCalls: [],
    content: [
      {
        type: 'text',
        text: 'Hello',
      },
    ],
  },
]

const mocks = vi.hoisted(() => ({
  runForegroundDocument: vi.fn(),
  captureExceptionMock: vi.fn(),
  enqueueRun: vi.fn(),
  isFeatureEnabledByName: vi.fn(),
  resolveAbTestRouting: vi.fn(),
  createRequestAbortSignal: vi.fn(),
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
  '@latitude-data/core/services/commits/foregroundRun',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal

    return {
      ...original,
      runForegroundDocument: mocks.runForegroundDocument,
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

vi.mock(
  '@latitude-data/core/services/deploymentTests/resolveAbTestRouting',
  () => ({
    resolveAbTestRouting: mocks.resolveAbTestRouting,
  }),
)

vi.mock('$/common/createRequestAbortSignal', () => ({
  createRequestAbortSignal: mocks.createRequestAbortSignal,
}))

let route: string
let body: string
let token: string
let headers: Record<string, string>
let project: Project
let workspace: Workspace
let commit: Commit
let provider: ProviderApiKey
let user: any
let document: DocumentVersion

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
      token = apikey!.token
      const path = 'path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const docResult = await createDocumentVersion({
        workspace,
        user,
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })
      document = docResult.documentVersion

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.path,
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

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      // By default, return a non-aborted signal
      mocks.createRequestAbortSignal.mockImplementation(() => {
        return new AbortController().signal
      })
    })

    it('uses source from __internal', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
              response: {
                text: 'Hello',
                usage: {},
              },
            },
          })

          controller.close()
        },
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.Playground,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: { text: 'Hello', usage: {} },
            provider: provider,
          }),
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

      expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ id: workspace.id }),
          document: expect.anything(),
          commit: expect.objectContaining({ id: commit.id }),
          project: expect.objectContaining({ id: project.id }),
          parameters: {},
          tools: [],
          source: LogSources.Playground,
          abortSignal: expect.anything(),
          userMessage: undefined,
          customIdentifier: undefined,
        }),
      )
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

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: { text: 'Hello', usage: {} },
            provider: provider,
          }),
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      const { done, value } = await testConsumeStream(
        res.body as ReadableStream,
      )
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

    it('sends mcpHeaders to runForegroundDocument', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
            },
          })

          controller.close()
        },
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: { text: 'Hello', usage: {} },
            provider: provider,
          }),
        }),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          stream: true,
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
        }),
        headers,
      })

      expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ id: workspace.id }),
          document: expect.anything(),
          commit: expect.objectContaining({ id: commit.id }),
          project: expect.objectContaining({ id: project.id }),
          parameters: { foo: 'bar' },
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
        }),
      )
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
                  role: 'assistant',
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

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: {},
            provider: provider,
          }),
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
      token = apikey!.token
      const path = 'path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const docResult = await createDocumentVersion({
        workspace,
        user,
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })
      document = docResult.documentVersion

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.path,
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

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      // By default, return a non-aborted signal
      mocks.createRequestAbortSignal.mockImplementation(() => {
        return new AbortController().signal
      })
    })

    it('uses source from __internal', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
              response: {
                text: 'Hello',
                usage: {},
              },
            },
          })

          controller.close()
        },
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.Playground,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: { text: 'Hello', usage: {} },
            provider: provider,
          }),
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

      expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ id: workspace.id }),
          document: expect.anything(),
          commit: expect.objectContaining({ id: commit.id }),
          project: expect.objectContaining({ id: project.id }),
          parameters: {},
          tools: [],
          source: LogSources.Playground,
          abortSignal: expect.anything(),
          userMessage: undefined,
          customIdentifier: undefined,
        }),
      )
    })



    it('returns 499 when request is aborted and no final response is produced', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            // Simulate an empty final response (seen in Datadog) when the client disconnects
            // before any content is produced.
            response: undefined as any,
            provider: provider,
          }),
        }),
      )

      const ac = new AbortController()
      ac.abort()

      // Mock createRequestAbortSignal to return the aborted signal for this test
      mocks.createRequestAbortSignal.mockReturnValue(ac.signal)

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
        signal: ac.signal,
      })

      expect(res.status).toBe(499)
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

      const expectedCost = estimateCost({
        provider: provider.provider,
        model: MODEL,
        usage,
      })

      await createProviderLog({
        documentLogUuid,
        workspace,
        providerId: provider.id,
        providerType: provider.provider,
        model: MODEL,
        messages: responseMessages,
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

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: {
              streamType: 'object',
              object: { something: { else: 'here' } },
              text: 'Hello',
              usage,
              documentLogUuid,
              input: responseMessages,
              model: MODEL,
              provider: Providers.OpenAI,
              cost: expectedCost,
            },
            provider: provider,
          }),
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        uuid: documentLogUuid,
        conversation: responseMessages,
        response: {
          streamType: 'object',
          usage,
          text: 'Hello',
          toolCalls: [],
          object: { something: { else: 'here' } },
          input: responseMessages,
          model: MODEL,
          provider: Providers.OpenAI,
          cost: expectedCost,
        },
        source: {
          commitUuid: commit.uuid,
          documentUuid: expect.any(String),
        },
      })
    })

    it('returns error when runForegroundDocument has an error', async () => {
      const error = Promise.resolve(
        new ChainError({
          code: RunErrorCodes.ChainCompileError,
          message: 'Error compiling prompt for document uuid',
        }),
      )

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream: new ReadableStream(),
          error,
          getFinalResponse: async () => {
            const err = await error
            throw err
          },
        }),
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

    it('returns error if runForegroundDocument has not documentLogUuid', async () => {
      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream: new ReadableStream(),
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: {
              streamType: 'object',
              object: { something: { else: 'here' } },
              text: 'Hello',
              usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
              input: responseMessages,
              model: MODEL,
              provider: Providers.OpenAI,
              cost: 0,
            },
            provider: provider,
          }),
        }),
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

    it('returns error if runForegroundDocument has no input', async () => {
      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream: new ReadableStream(),
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: {
              streamType: 'object',
              object: { something: { else: 'here' } },
              text: 'Hello',
              usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
              documentLogUuid: 'fake-document-log-uuid',
              model: MODEL,
              provider: Providers.OpenAI,
              cost: 0,
            },
            provider: provider,
          }),
        }),
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
      token = apikey!.token
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
      mocks.runForegroundDocument.mockClear()
      mocks.resolveAbTestRouting.mockClear()

      // Set default mocks for feature flags
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })
    })

    it('uses new method when SDK version >= 5.0.0', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: { text: 'Hello', usage: {} },
            provider: provider,
          }),
        }),
      )

      await app.request(route, {
        method: 'POST',
        body,
        headers: {
          ...headers,
          'X-Latitude-SDK-Version': '5.0.0',
        },
      })

      expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ id: workspace.id }),
          document: expect.anything(),
          commit: expect.objectContaining({ id: commit.id }),
          project: expect.objectContaining({ id: project.id }),
          parameters: {},
          tools: [],
          userMessage: undefined,
          source: LogSources.API,
          abortSignal: expect.anything(),
          customIdentifier: undefined,
        }),
      )
    })

    it('uses new method when no SDK version header (defaults to latest)', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: { text: 'Hello', usage: {} },
            provider: provider,
          }),
        }),
      )

      await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ id: workspace.id }),
          document: expect.anything(),
          commit: expect.objectContaining({ id: commit.id }),
          project: expect.objectContaining({ id: project.id }),
          parameters: {},
          userMessage: undefined,
          tools: [],
          source: LogSources.API,
          abortSignal: expect.anything(),
          customIdentifier: undefined,
        }),
      )
    })
  })

  describe('background execution with feature flag', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user: usr,
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
      user = usr
      provider = providers[0]!
      const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      token = apikey!.token
      const path = 'path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const doc = await createDocumentVersion({
        workspace,
        user,
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })
      document = doc.documentVersion

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.path,
        parameters: {},
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Latitude-SDK-Version': '5.0.0',
      }

      // Reset mocks
      mocks.runForegroundDocument.mockClear()
      mocks.enqueueRun.mockClear()
      mocks.isFeatureEnabledByName.mockClear()
      mocks.resolveAbTestRouting.mockClear()

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })
    })

    it('runs in background when background=true is explicitly set', async () => {
      // Mock feature flag for api-background-runs
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
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
      expect(mocks.runForegroundDocument).not.toHaveBeenCalled()
    })

    it('passes mcpHeaders to enqueueRun for background execution', async () => {
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.enqueueRun.mockReturnValue(
        Promise.resolve(
          Result.ok({
            run: { uuid: 'test-run-uuid' },
          }),
        ),
      )

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          background: true,
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
        }),
        headers,
      })

      expect(mocks.enqueueRun).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ id: workspace.id }),
          document: expect.anything(),
          commit: expect.objectContaining({ id: commit.id }),
          project: expect.objectContaining({ id: project.id }),
          parameters: { foo: 'bar' },
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
        }),
      )
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
        messages: responseMessages,
        tokens: usage.totalTokens,
      })

      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const expectedCost = estimateCost({
        provider: provider.provider,
        model: MODEL,
        usage,
      })

      const lastResponse = Promise.resolve({
        streamType: 'text',
        text: 'Hello',
        usage,
        documentLogUuid,
        toolCalls: [],
        input: responseMessages,
        model: MODEL,
        provider: Providers.OpenAI,
        cost: expectedCost,
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })

      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: await lastResponse,
            provider: provider,
          }),
        }),
      )

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
        conversation: responseMessages,
        response: {
          streamType: 'text',
          usage,
          text: 'Hello',
          toolCalls: [],
          input: responseMessages,
          model: MODEL,
          provider: Providers.OpenAI,
          cost: expectedCost,
        },
        source: {
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        },
      })
      expect(mocks.runForegroundDocument).toHaveBeenCalled()
      expect(mocks.enqueueRun).not.toHaveBeenCalled()
    })

    it('runs in background when feature flag is enabled and background param is undefined', async () => {
      // Clear previous mocks and set up new ones
      mocks.runForegroundDocument.mockClear()
      mocks.enqueueRun.mockClear()

      // Mock feature flag: api-background-runs enabled, background not specified
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(true))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
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
      expect(mocks.runForegroundDocument).not.toHaveBeenCalled()
    })

    it('runs in foreground when feature flag is disabled and background param is undefined', async () => {
      // Mock feature flag: api-background-runs disabled, background not specified
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
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
        messages: responseMessages,
        tokens: usage.totalTokens,
      })

      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const expectedCost = estimateCost({
        provider: provider.provider,
        model: MODEL,
        usage,
      })

      const lastResponse = Promise.resolve({
        streamType: 'text',
        text: 'Hello',
        usage,
        documentLogUuid,
        toolCalls: [],
        input: responseMessages,
        model: MODEL,
        provider: Providers.OpenAI,
        cost: expectedCost,
      })
      mocks.runForegroundDocument.mockReturnValue(
        Promise.resolve({
          stream,
          error: Promise.resolve(undefined),
          getFinalResponse: async () => ({
            response: await lastResponse,
            provider: provider,
          }),
        }),
      )

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
        conversation: responseMessages,
        response: {
          streamType: 'text',
          usage,
          text: 'Hello',
          toolCalls: [],
          input: responseMessages,
          model: MODEL,
          provider: Providers.OpenAI,
          cost: expectedCost,
        },
        source: {
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        },
      })
      expect(mocks.runForegroundDocument).toHaveBeenCalled()
      expect(mocks.enqueueRun).not.toHaveBeenCalled()
    })
  })

  describe('deployment test routing', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user: usr,
        project: prj,
        providers,
      } = await createProject()
      project = prj
      workspace = wsp
      user = usr
      provider = providers[0]!

      const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      token = apikey!.token
      const path = 'path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const doc = await createDocumentVersion({
        workspace,
        user,
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })
      document = doc.documentVersion

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.path,
        parameters: {},
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Latitude-SDK-Version': '5.0.0',
      }

      // Reset other mocks
      mocks.runForegroundDocument.mockClear()
      mocks.enqueueRun.mockClear()
      mocks.resolveAbTestRouting.mockClear()

      // Set default mocks
      mocks.isFeatureEnabledByName.mockImplementation((_, featureName) => {
        if (featureName === 'api-background-runs') {
          return Promise.resolve(Result.ok(false))
        }
        return Promise.resolve(Result.ok(false))
      })

      mocks.resolveAbTestRouting.mockResolvedValue({
        abTest: null,
        effectiveCommit: commit,
        effectiveDocument: document,
        effectiveSource: LogSources.API,
      })
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

        mocks.resolveAbTestRouting.mockResolvedValue({
          abTest: shadowTest,
          effectiveCommit: commit,
          effectiveDocument: document,
          effectiveSource: LogSources.API,
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
          messages: responseMessages,
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runForegroundDocument.mockReturnValue(
          Promise.resolve({
            stream,
            error: Promise.resolve(undefined),
            getFinalResponse: async () => ({
              response: {
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                toolCalls: [],
                input: responseMessages,
                model: MODEL,
                provider: Providers.OpenAI,
                cost: 0,
              },
              provider: provider,
            }),
          }),
        )

        const res = await app.request(route, {
          method: 'POST',
          body,
          headers,
        })

        expect(res.status).toBe(200)
        expect(mocks.runForegroundDocument).toHaveBeenCalled()
        // Should use original commit for baseline
        expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
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
          user,
        })
        await updateDocumentVersion({
          document,
          commit: newCommit,
          content: helpers.createPrompt({ provider }),
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

        mocks.resolveAbTestRouting.mockResolvedValue({
          abTest,
          effectiveCommit: commit,
          effectiveDocument: document,
          effectiveSource: LogSources.API,
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
          messages: responseMessages,
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runForegroundDocument.mockReturnValue(
          Promise.resolve({
            stream,
            error: Promise.resolve(undefined),
            getFinalResponse: async () => ({
              response: {
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                toolCalls: [],
                input: responseMessages,
                model: MODEL,
                provider: Providers.OpenAI,
                cost: 0,
              },
              provider: provider,
            }),
          }),
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
        expect(mocks.resolveAbTestRouting).toHaveBeenCalledWith({
          workspaceId: workspace.id,
          projectId: project.id,
          commit,
          document: expect.anything(),
          source: LogSources.API,
          customIdentifier: 'user-123',
        })
        expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
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

        mocks.resolveAbTestRouting.mockResolvedValue({
          abTest,
          effectiveCommit: challengerCommit,
          effectiveDocument: document,
          effectiveSource: LogSources.ABTestChallenger,
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
          messages: responseMessages,
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runForegroundDocument.mockReturnValue(
          Promise.resolve({
            stream,
            error: Promise.resolve(undefined),
            getFinalResponse: async () => ({
              response: {
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                toolCalls: [],
                input: responseMessages,
                model: MODEL,
                provider: Providers.OpenAI,
                cost: 0,
              },
              provider: provider,
            }),
          }),
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
        expect(mocks.resolveAbTestRouting).toHaveBeenCalledWith({
          workspaceId: workspace.id,
          projectId: project.id,
          commit,
          document: expect.anything(),
          source: LogSources.API,
          customIdentifier: 'user-456',
        })
        expect(mocks.runForegroundDocument).toHaveBeenCalledWith(
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

        mocks.resolveAbTestRouting.mockResolvedValue({
          abTest,
          effectiveCommit: commit,
          effectiveDocument: document,
          effectiveSource: LogSources.API,
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
          messages: responseMessages,
          tokens: usage.totalTokens,
        })

        const stream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        mocks.runForegroundDocument.mockReturnValue(
          Promise.resolve({
            stream,
            error: Promise.resolve(undefined),
            getFinalResponse: async () => ({
              response: {
                streamType: 'text',
                text: 'Hello',
                usage,
                documentLogUuid,
                toolCalls: [],
                input: responseMessages,
                model: MODEL,
                provider: Providers.OpenAI,
                cost: 0,
              },
              provider: provider,
            }),
          }),
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
        expect(mocks.resolveAbTestRouting).toHaveBeenCalledWith({
          workspaceId: workspace.id,
          projectId: project.id,
          commit,
          document: expect.anything(),
          source: LogSources.API,
          customIdentifier: undefined,
        })
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

        mocks.resolveAbTestRouting.mockResolvedValue({
          abTest: shadowTest,
          effectiveCommit: commit,
          effectiveDocument: document,
          effectiveSource: LogSources.API,
        })

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
