import { Latitude, LogSources } from '$sdk/index'
import { FINAL_RESPONSE } from '$sdk/test/chunks-example'
import {
  ApiErrorCodes,
  LatitudeApiError,
  LatitudeErrorCodes,
  RunErrorCodes,
} from '$sdk/utils/errors'
import { parseSSE } from '$sdk/utils/parseSSE'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  Mock,
  vi,
} from 'vitest'

import {
  mock502Response,
  mockNonStreamResponse,
  mockRequest,
  mockStreamResponse,
} from './helpers/run'
import { RUN_TEXT_RESPONSE } from '$sdk/test/run-sync-response'
import {
  mockToolsServers,
  buildMockTools,
  MockedTools,
} from '$sdk/tests/helpers/mockTools/server'
import {
  ChainEventTypes,
  AGENT_RETURN_TOOL_NAME,
} from '@latitude-data/constants'

let latitudeApiKey = 'fake-api-key'
let projectId = 123

const server = setupServer()
const mockedTools = mockToolsServers()

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
          stream: true,
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
          // @ts-expect-error
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

    describe('tool calling', () => {
      let mockRunBody: Mock
      let mockChatBody: Mock
      beforeEach(() => {
        const mocks = mockedTools.setupStreamToolServer(server)
        mockRunBody = mocks.mockRunBody
        mockChatBody = mocks.mockChatBody

        vi.clearAllMocks()
      })

      it(
        'calls recursively chat endpoint when tools are defined',
        server.boundary(async () => {
          await sdk.prompts.run<MockedTools>('path/to/document', {
            projectId,
            parameters: {},
            stream: true,
            tools: buildMockTools(),
          })
          expect(mockRunBody).toHaveBeenCalledTimes(1)
          expect(mockChatBody).toHaveBeenNthCalledWith(1, {
            body: {
              stream: true,
              __internal: { source: 'api' },
              messages: [
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_coordinates',
                      toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                      isError: false,
                      result: {
                        latitude: '41.3851',
                        longitude: '2.1734',
                      },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_coordinates',
                      toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                      isError: false,
                      result: {
                        latitude: '25.7617',
                        longitude: '-80.1918',
                      },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_coordinates',
                      toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                      isError: false,
                      result: {
                        latitude: '42.3601',
                        longitude: '-71.0589',
                      },
                    },
                  ],
                },
              ],
            },
          })
          expect(mockChatBody).toHaveBeenNthCalledWith(2, {
            body: {
              stream: true,
              __internal: { source: 'api' },
              messages: [
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_weather',
                      toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                      isError: false,
                      result: { temperature: 24 },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_weather',
                      toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                      isError: false,
                      result: { temperature: 30 },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_weather',
                      toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                      isError: false,
                      result: { temperature: 10 },
                    },
                  ],
                },
              ],
            },
          })
        }),
      )

      it(
        'cancel execution',
        server.boundary(async () => {
          const onFinished = vi.fn()
          const onPausedExecutionCallback = vi.fn()
          await sdk.prompts.run<MockedTools>('path/to/document', {
            projectId,
            parameters: {},
            stream: true,
            onFinished,
            tools: buildMockTools({
              pauseExecution: true,
              onPausedExecutionCallback,
            }),
          })
          expect(mockRunBody).toHaveBeenCalledTimes(1)
          expect(mockChatBody).not.toHaveBeenCalled()
          expect(onFinished).toHaveBeenCalledTimes(1)
          expect(onPausedExecutionCallback).toHaveBeenNthCalledWith(1, {
            toolId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
            toolName: 'get_coordinates',
            pauseExecution: expect.any(Function),
            conversationUuid: '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b',
            messages: [
              {
                content: [
                  {
                    text: expect.any(String),
                    type: 'text',
                  },
                  {
                    text: 'First, locate the one or many recommendation requests.',
                    type: 'text',
                  },
                ],
                role: 'system',
              },
              {
                content: [
                  {
                    text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
                    type: 'text',
                  },
                ],
                role: 'user',
              },
              {
                content: [
                  {
                    args: {
                      location: 'Barcelona',
                    },
                    toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                    toolName: 'get_coordinates',
                    type: 'tool-call',
                  },
                  {
                    args: {
                      location: 'Miami',
                    },
                    toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                    toolName: 'get_coordinates',
                    type: 'tool-call',
                  },
                  {
                    args: {
                      location: 'Boston',
                    },
                    toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                    toolName: 'get_coordinates',
                    type: 'tool-call',
                  },
                ],
                role: 'assistant',
                toolCalls: [
                  {
                    arguments: {
                      location: 'Barcelona',
                    },
                    id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                    name: 'get_coordinates',
                  },
                  {
                    arguments: {
                      location: 'Miami',
                    },
                    id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                    name: 'get_coordinates',
                  },
                  {
                    arguments: {
                      location: 'Boston',
                    },
                    id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                    name: 'get_coordinates',
                  },
                ],
              },
            ],
            requestedToolCalls: [
              {
                arguments: {
                  location: 'Barcelona',
                },
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
              },
              {
                arguments: {
                  location: 'Miami',
                },
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
              },
              {
                arguments: {
                  location: 'Boston',
                },
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
              },
            ],
          })
        }),
      )

      it(
        'call onEvent callback for all requests',
        server.boundary(async () => {
          const onEvent = vi.fn()
          await sdk.prompts.run<MockedTools>('path/to/document', {
            projectId,
            parameters: {},
            stream: true,
            onEvent,
            tools: buildMockTools(),
          })
          expect(onEvent).toHaveBeenCalledTimes(19)
        }),
      )

      it(
        'call onFinish callback with final response',
        server.boundary(async () => {
          const onFinished = vi.fn()
          await sdk.prompts.run<MockedTools>('path/to/document', {
            projectId,
            parameters: {},
            stream: true,
            onFinished,
            tools: buildMockTools(),
          })

          const finalText = `- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.

- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.

- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.`

          expect(onFinished).toHaveBeenCalledTimes(1)
          expect(onFinished).toHaveBeenNthCalledWith(1, {
            conversation: expect.any(Array), // all messages
            response: {
              documentLogUuid: '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b',
              streamType: 'text',
              text: finalText,
              toolCalls: [],
              usage: {
                completionTokens: 115,
                promptTokens: 523,
                totalTokens: 638,
              },
            },
            toolRequests: [],
            uuid: '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b',
          })
        }),
      )

      it(
        'return first response if no tools are defined',
        server.boundary(async () => {
          await sdk.prompts.run('path/to/document', {
            projectId,
            parameters: {},
            stream: true,
          })
          expect(mockRunBody).toHaveBeenCalledTimes(1)
          expect(mockChatBody).not.toHaveBeenCalled()
        }),
      )

      it(
        'throws error when a tool call is requests and tool handler is not defined',
        server.boundary(async () => {
          await expect(
            sdk.prompts.run('path/to/document', {
              projectId,
              parameters: {},
              stream: true,
              tools: {
                // @ts-ignore
                not_the_right_tool: async ({ id }) => ({
                  id,
                  name: 'not_the_right_tool',
                  result: {},
                }),
                // @ts-ignore
                not_the_right_tool_2: async ({ id }) => ({
                  id,
                  name: 'not_the_right_tool',
                  result: {},
                }),
              },
            }),
          ).rejects.toThrowError(
            new LatitudeApiError({
              status: 400,
              message:
                'An AI request needs these tools: get_coordinates but are not declared in the tools object in the SDK. You declared these tools: not_the_right_tool, not_the_right_tool_2',
              errorCode: LatitudeErrorCodes.UnprocessableEntityError,
              serverResponse: 'No response',
            }),
          )
        }),
      )

      it(
        'catch error when a handler fails',
        server.boundary(async () => {
          await expect(
            sdk.prompts.run('path/to/document', {
              projectId,
              parameters: {},
              stream: true,
              tools: {
                // @ts-ignore
                get_coordinates: async () => {
                  throw new Error('Coordinates service is down')
                },
              },
            }),
          ).rejects.toThrowError(new Error('Coordinates service is down'))
        }),
      )
    })

    describe('agent prompts', () => {
      it(
        'returns the agent response as a property',
        server.boundary(async () => {
          const customChunks = [
            `event: latitude-event
data: ${JSON.stringify({
              type: ChainEventTypes.ChainStarted,
              uuid: 'some-uuid',
            })}
        `,
            `event: latitude-event
data: ${JSON.stringify({
              type: ChainEventTypes.ProviderStarted,
              uuid: 'some-uuid',
              messages: [],
            })}
        `,
            `event: latitude-event
data: ${JSON.stringify({
              type: ChainEventTypes.ProviderCompleted,
              uuid: 'some-uuid',
              response: {
                // some response
              },
              messages: [
                {
                  role: 'assistant',
                  toolCalls: [
                    {
                      id: 'some-id',
                      name: AGENT_RETURN_TOOL_NAME,
                      arguments: {
                        response: 'AI Agent response!',
                      },
                    },
                  ],
                },
              ],
            })}
        `,
            `event: latitude-event
data: ${JSON.stringify({
              type: ChainEventTypes.ToolsRequested,
              uuid: 'some-uuid',
              messages: [
                {
                  role: 'assistant',
                  toolCalls: [
                    {
                      id: 'some-id',
                      name: AGENT_RETURN_TOOL_NAME,
                      arguments: {
                        response: 'AI Agent response!',
                      },
                    },
                  ],
                },
              ],
              tools: [
                {
                  id: 'some-id',
                  name: AGENT_RETURN_TOOL_NAME,
                  arguments: {
                    response: 'AI Agent response!',
                  },
                },
              ],
              response: {},
            })}
        `,
          ]
          const onFinishMock = vi.fn()
          const onErrorMock = vi.fn()
          mockStreamResponse({
            server,
            apiVersion: 'v3',
            customChunks,
            closeOnLastCustomChunk: true,
          })
          const response = await sdk.prompts.run('path/to/document', {
            projectId,
            parameters: { foo: 'bar', lol: 'foo' },
            stream: true,
            onFinished: onFinishMock,
            onError: onErrorMock,
          })
          expect(response?.agentResponse).toBeDefined()
          expect(response?.agentResponse).toEqual({
            response: 'AI Agent response!',
          })
        }),
      )
    })
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

    describe('tool calling', () => {
      let mockRunBody: Mock
      let mockChatBody: Mock

      beforeAll(() => {
        const mocks = mockedTools.setupSyncToolsServer(server)
        mockRunBody = mocks.mockRunBody
        mockChatBody = mocks.mockChatBody
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      it(
        'calls recursively chat endpoint when tools are defined',
        server.boundary(async () => {
          const onFinished = vi.fn()
          await sdk.prompts.run<MockedTools>('path/to/document', {
            projectId,
            parameters: {},
            onFinished,
            stream: false,
            tools: buildMockTools(),
          })
          expect(onFinished).toHaveBeenCalledTimes(1)
          expect(mockRunBody).toHaveBeenCalledTimes(1)
          expect(mockChatBody).toHaveBeenNthCalledWith(1, {
            body: {
              stream: false,
              __internal: { source: 'api' },
              messages: [
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_coordinates',
                      toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                      isError: false,
                      result: {
                        latitude: '41.3851',
                        longitude: '2.1734',
                      },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_coordinates',
                      toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                      isError: false,
                      result: {
                        latitude: '25.7617',
                        longitude: '-80.1918',
                      },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_coordinates',
                      toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                      isError: false,
                      result: {
                        latitude: '42.3601',
                        longitude: '-71.0589',
                      },
                    },
                  ],
                },
              ],
            },
          })
          expect(mockChatBody).toHaveBeenNthCalledWith(2, {
            body: {
              stream: false,
              __internal: { source: 'api' },
              messages: [
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_weather',
                      toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                      isError: false,
                      result: { temperature: 24 },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_weather',
                      toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                      isError: false,
                      result: { temperature: 30 },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'get_weather',
                      toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                      isError: false,
                      result: { temperature: 10 },
                    },
                  ],
                },
              ],
            },
          })
        }),
      )
    })
  })
})
