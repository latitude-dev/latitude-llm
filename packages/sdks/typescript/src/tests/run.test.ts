import { Latitude, LogSources } from '$sdk/index'
import { FINAL_RESPONSE } from '$sdk/test/chunks-example'
import {
  ApiErrorCodes,
  LatitudeApiError,
  RunErrorCodes,
} from '$sdk/utils/errors'
import { parseSSE } from '$sdk/utils/parseSSE'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { RUN_TEXT_RESPONSE } from '$sdk/test/run-sync-response'
import {
  mock502Response,
  mockNonStreamResponse,
  mockRequest,
  mockStreamResponse,
} from './helpers/run'

const latitudeApiKey = 'fake-api-key'
const projectId = 123

const server = setupServer()

describe('/run', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  let sdk = new Latitude(latitudeApiKey, {
    __internal: { retryMs: 1 },
  })

  describe('with streaming', () => {
    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockAuthHeader } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'live',
          projectId: '123',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          stream: true,
        })

        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'sends project id',
      server.boundary(async () => {
        const { mockUrl } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'live',
          projectId: '123',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          stream: true,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v3/projects/123/versions/live/documents/run',
        )
      }),
    )

    it('it use project id defined in class', async () => {
      sdk = new Latitude(latitudeApiKey, {
        projectId: 345,
        __internal: { retryMs: 1 },
      })
      const { mockUrl } = mockRequest({
        server,
        apiVersion: 'v3',
        version: 'live',
        projectId: '345',
      })
      await sdk.prompts.run('path/to/document', {
        stream: true,
      })
      expect(mockUrl).toHaveBeenCalledWith(
        'http://localhost:8787/api/v3/projects/345/versions/live/documents/run',
      )
    })

    it(
      'sends request with specific versionUuid',
      server.boundary(async () => {
        const { mockUrl, version } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: version,
          stream: true,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v3/projects/123/versions/SOME_UUID/documents/run',
        )
      }),
    )

    it(
      'sends documentPath and parameters and customIdentifier',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
          stream: true,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
          tools: [],
          stream: true,
          background: false,
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'sends userMessage in request body when provided',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar' },
          userMessage: 'Hello, this is a test message',
          stream: true,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          userMessage: 'Hello, this is a test message',
          tools: [],
          stream: true,
          background: false,
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'sends tools names in request body when provided',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar' },
          tools: {
            get_weather: async () => 'sunny',
            get_time: async () => '12:00',
          },
          stream: true,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          tools: ['get_weather', 'get_time'],
          stream: true,
          background: false,
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'sends mcpHeaders in request body when provided',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar' },
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
          stream: true,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
          tools: [],
          stream: true,
          background: false,
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'send data onMessage callback',
      server.boundary(async () => {
        const onMessageMock = vi.fn()
        const { chunks } = mockStreamResponse({
          server,
          apiVersion: 'v3',
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
          stream: true,
          onEvent: onMessageMock,
        })
        chunks.forEach((chunk, index) => {
          // @ts-expect-error - parseSSE typing
          const { event, data } = parseSSE(chunk)
          expect(onMessageMock).toHaveBeenNthCalledWith(index + 1, {
            event,
            data: JSON.parse(data),
          })
        })
      }),
    )

    it(
      'sends all message onFinish callback and final response',
      server.boundary(async () => {
        const onFinishMock = vi.fn()
        const onErrorMock = vi.fn()
        mockStreamResponse({
          server,
          apiVersion: 'v3',
        })
        const final = await sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
          stream: true,
          onFinished: onFinishMock,
          onError: onErrorMock,
        })
        expect(onErrorMock).not.toHaveBeenCalled()
        expect(onFinishMock).toHaveBeenCalledWith(FINAL_RESPONSE)
        expect(final).toEqual(FINAL_RESPONSE)
      }),
    )

    it(
      'sends onError callback when error is received',
      server.boundary(async () => {
        const onFinishMock = vi.fn()
        const onErrorMock = vi.fn()
        const customChunks = [
          `event: latitude-event
data: ${JSON.stringify({
            type: 'chain-error',
            error: {
              message: 'Something bad happened',
            },
          })}
        `,
        ]
        mockStreamResponse({
          server,
          apiVersion: 'v3',
          customChunks,
        })

        await sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
          stream: true,
          onFinished: onFinishMock,
          onError: onErrorMock,
        })

        // FIXME: we are reporting errors too many times
        expect(onErrorMock).toHaveBeenCalledTimes(2)
        expect(onErrorMock).toHaveBeenCalledWith(
          new LatitudeApiError({
            status: 402,
            message: 'Something bad happened',
            serverResponse: 'Something bad happened',
            errorCode: RunErrorCodes.AIRunError,
          }),
        )
        expect(onFinishMock).not.toHaveBeenCalled()
      }),
    )

    it(
      'accepts abort signal option without error',
      server.boundary(async () => {
        mockStreamResponse({
          server,
          apiVersion: 'v3',
        })

        const abortController = new AbortController()

        // Run with signal (verify it's accepted and doesn't break streaming)
        const result = await sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar' },
          stream: true,
          signal: abortController.signal,
        })

        expect(result).toEqual(FINAL_RESPONSE)
      }),
    )
  })

  describe('without streaming', () => {
    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockAuthHeader } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'live',
          projectId: '123',
          fakeResponse: RUN_TEXT_RESPONSE,
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          stream: false,
        })

        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'sends project id',
      server.boundary(async () => {
        const { mockUrl } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'live',
          projectId: '123',
          fakeResponse: RUN_TEXT_RESPONSE,
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          stream: false,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v3/projects/123/versions/live/documents/run',
        )
      }),
    )

    it('it use project id defined in class', async () => {
      const oldSdk = sdk
      sdk = new Latitude(latitudeApiKey, {
        projectId: 345,
      })
      const { mockUrl } = mockRequest({
        server,
        apiVersion: 'v3',
        version: 'live',
        projectId: '345',
        fakeResponse: RUN_TEXT_RESPONSE,
      })
      await sdk.prompts.run('path/to/document', {
        stream: false,
      })
      expect(mockUrl).toHaveBeenCalledWith(
        'http://localhost:8787/api/v3/projects/345/versions/live/documents/run',
      )
      sdk = oldSdk
    })

    it(
      'sends request with specific versionUuid',
      server.boundary(async () => {
        const { mockUrl, version } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
          fakeResponse: RUN_TEXT_RESPONSE,
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: version,
          stream: false,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v3/projects/123/versions/SOME_UUID/documents/run',
        )
      }),
    )

    it(
      'send body stream, customIdentifier, path, parameters',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
          fakeResponse: RUN_TEXT_RESPONSE,
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
          stream: false,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
          stream: false,
          background: false,
          tools: [],
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'sends userMessage in request body when provided (non-streaming)',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
          fakeResponse: RUN_TEXT_RESPONSE,
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar' },
          userMessage: 'Hello, this is a test message for non-streaming',
          stream: false,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          userMessage: 'Hello, this is a test message for non-streaming',
          stream: false,
          background: false,
          tools: [],
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'sends tools names in request body when provided (non-streaming)',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
          fakeResponse: RUN_TEXT_RESPONSE,
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar' },
          tools: {
            get_weather: async () => 'sunny',
            get_time: async () => '12:00',
          },
          stream: false,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          tools: ['get_weather', 'get_time'],
          stream: false,
          background: false,
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'sends mcpHeaders in request body when provided (non-streaming)',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v3',
          version: 'SOME_UUID',
          projectId: '123',
          fakeResponse: RUN_TEXT_RESPONSE,
        })
        await sdk.prompts.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar' },
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
          stream: false,
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar' },
          mcpHeaders: {
            'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            'github-mcp': { 'x-github-token': 'ghp_abc123' },
          },
          tools: [],
          stream: false,
          background: false,
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'do not send data onEvent callback',
      server.boundary(async () => {
        const onMessageMock = vi.fn()
        mockNonStreamResponse({ server, expectedBody: FINAL_RESPONSE })
        await sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
          stream: false,
          onEvent: onMessageMock,
        })
        expect(onMessageMock).not.toHaveBeenCalled()
      }),
    )

    it(
      'sends all message onFinish callback and final response',
      server.boundary(async () => {
        const onFinishMock = vi.fn()
        const onErrorMock = vi.fn()
        mockNonStreamResponse({
          server,
          expectedBody: FINAL_RESPONSE,
        })
        const response = await sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
          stream: false,
          onFinished: onFinishMock,
          onError: onErrorMock,
        })
        expect(onErrorMock).not.toHaveBeenCalled()
        expect(onFinishMock).toHaveBeenCalledWith(FINAL_RESPONSE)
        expect(response).toEqual(FINAL_RESPONSE)
      }),
    )

    it('does not throw error if onError option is present', async () => {
      const onErrorMock = vi.fn()
      const failedResponse = {
        name: 'LatitudeError',
        errorCode: RunErrorCodes.AIProviderConfigError,
        message: 'Document Log uuid not found in response',
        details: {},
      }
      mockNonStreamResponse({
        server,
        expectedBody: failedResponse,
        expectedStatus: 402,
      })
      await sdk.prompts.run('path/to/document', {
        projectId,
        parameters: { foo: 'bar', lol: 'foo' },
        stream: false,
        onError: onErrorMock,
      })
      expect(onErrorMock).toHaveBeenCalledWith(
        new LatitudeApiError({
          status: 402,
          serverResponse: JSON.stringify(failedResponse),
          message: 'Document Log uuid not found in response',
          errorCode: RunErrorCodes.AIProviderConfigError,
          dbErrorRef: undefined,
        }),
      )
    })

    it('does throw error if onError option is NOT present', async () => {
      const failedResponse = {
        name: 'LatitudeError',
        errorCode: RunErrorCodes.AIProviderConfigError,
        message: 'Document Log uuid not found in response',
        details: {},
      }
      mockNonStreamResponse({
        server,
        expectedBody: failedResponse,
        expectedStatus: 402,
      })
      await expect(
        sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
          stream: false,
        }),
      ).rejects.toThrowError(
        new LatitudeApiError({
          status: 402,
          serverResponse: JSON.stringify(failedResponse),
          message: 'Document Log uuid not found in response',
          errorCode: RunErrorCodes.AIProviderConfigError,
          dbErrorRef: undefined,
        }),
      )
    })

    it('handles 502/504 errors', async () => {
      const failedResponse = '<html>Not json!</html>'

      mockNonStreamResponse({
        server,
        expectedBody: failedResponse,
        expectedStatus: 502,
      })

      await expect(
        sdk.prompts.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
          stream: false,
        }),
      ).rejects.toThrowError(
        new LatitudeApiError({
          status: 502,
          serverResponse: 'Bad Gateway',
          message: 'Bad Gateway',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
    })

    it('should retry 3 times if gateway is not available', async () => {
      const onErrorMock = vi.fn()
      const { mockFn } = mock502Response({
        server,
      })

      await sdk.prompts.run('path/to/document', {
        projectId,
        parameters: { foo: 'bar', lol: 'foo' },
        stream: false,
        onError: onErrorMock,
      })
      expect(mockFn).toHaveBeenCalledTimes(3)
      expect(onErrorMock).toHaveBeenCalledWith(
        new LatitudeApiError({
          status: 502,
          serverResponse: JSON.stringify({
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: 'internal_server_error',
          }),
          message: 'Something bad happened',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
    })
  })
})
