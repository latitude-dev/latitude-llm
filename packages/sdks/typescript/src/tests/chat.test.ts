import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { Latitude, LogSources } from '$sdk/index'
import { ApiErrorCodes, LatitudeApiError } from '$sdk/utils/errors'
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
} from './helpers/chat'

let FAKE_LATITUDE_SDK_KEY = 'fake-api-key'
let sdk: Latitude

const server = setupServer()

describe('/chat', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    sdk = new Latitude(FAKE_LATITUDE_SDK_KEY, {
      __internal: { retryMs: 10 },
    })
  })

  describe('with streaming', () => {
    it(
      'makes request',
      server.boundary(async () => {
        const { mockAuthHeader, mockUrl, mockBody, conversationUuid } =
          mockStreamResponse({
            server,
            apiVersion: 'v3',
            conversationUuid: 'fake-document-log-uuid',
          })

        await sdk.prompts.chat(
          conversationUuid,
          [
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
          {
            stream: true,
          },
        )

        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
        expect(mockUrl).toHaveBeenCalledWith(
          `http://localhost:8787/api/v3/conversations/${conversationUuid}/chat`,
        )
        expect(mockBody).toHaveBeenCalledWith({
          body: {
            __internal: { source: LogSources.API },
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
            stream: true,
            tools: [],
          },
        })
      }),
    )

    it(
      'sends mcpHeaders in request body when provided',
      server.boundary(async () => {
        const { mockBody, conversationUuid } = mockStreamResponse({
          server,
          apiVersion: 'v3',
          conversationUuid: 'fake-document-log-uuid',
        })

        await sdk.prompts.chat(
          conversationUuid,
          [
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
          {
            stream: true,
            mcpHeaders: {
              'stripe-mcp': { authorization: 'Bearer sk_test_123' },
              'github-mcp': { 'x-github-token': 'ghp_abc123' },
            },
          },
        )

        expect(mockBody).toHaveBeenCalledWith({
          body: {
            __internal: { source: LogSources.API },
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
            stream: true,
            tools: [],
            mcpHeaders: {
              'stripe-mcp': { authorization: 'Bearer sk_test_123' },
              'github-mcp': { 'x-github-token': 'ghp_abc123' },
            },
          },
        })
      }),
    )

    it(
      'sends data to onMessage and returns final response and onFinish',
      server.boundary(async () => {
        const onMessageMock = vi.fn()
        const onFinishMock = vi.fn()
        const onErrorMock = vi.fn()
        const { chunks, finalResponse, conversationUuid } = mockStreamResponse({
          server,
          conversationUuid: 'fake-document-log-uuid',
          apiVersion: 'v3',
        })

        const response = await sdk.prompts.chat(
          conversationUuid,
          [
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
          {
            stream: true,
            onEvent: onMessageMock,
            onFinished: onFinishMock,
            onError: onErrorMock,
          },
        )

        chunks.forEach((chunk, index) => {
          // @ts-expect-error
          const { event, data } = parseSSE(chunk)
          expect(onMessageMock).toHaveBeenNthCalledWith(index + 1, {
            event,
            data: JSON.parse(data),
          })
        })
        expect(onFinishMock).toHaveBeenCalledWith(finalResponse)
        expect(response).toEqual(finalResponse)
        expect(onErrorMock).not.toHaveBeenCalled()
      }),
    )

    it('retries 3 times if gateway is not available', async () => {
      const onErrorMock = vi.fn()
      const { mockFn, conversationUuid } = mock502Response({
        server,
        apiVersion: 'v3',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
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
        { stream: true, onError: onErrorMock },
      )

      expect(mockFn).toHaveBeenCalledTimes(3)
      expect(onErrorMock).toHaveBeenCalledWith(
        new LatitudeApiError({
          status: 502,
          serverResponse: JSON.stringify({
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: ApiErrorCodes.InternalServerError,
          }),
          message: 'Something bad happened',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
    })

    it('does not throw error if onError option is present', async () => {
      const onErrorMock = vi.fn()
      const { mockFn, conversationUuid } = mock502Response({
        server,
        apiVersion: 'v3',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
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
        { stream: true, onError: onErrorMock },
      )

      expect(mockFn).toHaveBeenCalledTimes(3)
      expect(onErrorMock).toHaveBeenCalledWith(
        new LatitudeApiError({
          status: 502,
          serverResponse: JSON.stringify({
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: ApiErrorCodes.InternalServerError,
          }),
          message: 'Something bad happened',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
    })

    it('throws error if onError option is not present', async () => {
      const { mockFn, conversationUuid } = mock502Response({
        server,
        apiVersion: 'v3',
        conversationUuid: 'fake-document-log-uuid',
      })

      await expect(
        sdk.prompts.chat(
          conversationUuid,
          [
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
          { stream: true },
        ),
      ).rejects.toThrowError(
        new LatitudeApiError({
          status: 502,
          serverResponse: JSON.stringify({
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: ApiErrorCodes.InternalServerError,
          }),
          message: 'Something bad happened',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
      expect(mockFn).toHaveBeenCalledTimes(3)
    })
  })

  describe('without streaming', () => {
    it(
      'makes request',
      server.boundary(async () => {
        const { mockAuthHeader, mockUrl, mockBody, conversationUuid } =
          mockRequest({
            server,
            apiVersion: 'v3',
            conversationUuid: 'fake-document-log-uuid',
            fakeResponse: RUN_TEXT_RESPONSE,
          })

        await sdk.prompts.chat(
          conversationUuid,
          [
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
          {
            stream: false,
          },
        )

        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
        expect(mockUrl).toHaveBeenCalledWith(
          `http://localhost:8787/api/v3/conversations/${conversationUuid}/chat`,
        )
        expect(mockBody).toHaveBeenCalledWith({
          body: {
            __internal: { source: LogSources.API },
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
            tools: [],
            stream: false,
          },
        })
      }),
    )

    it(
      'returns final response and onFinish',
      server.boundary(async () => {
        const onFinishMock = vi.fn()
        const onErrorMock = vi.fn()
        const { finalResponse, conversationUuid } = mockNonStreamResponse({
          server,
          conversationUuid: 'fake-document-log-uuid',
          apiVersion: 'v3',
        })

        const response = await sdk.prompts.chat(
          conversationUuid,
          [
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
          {
            stream: false,
            onFinished: onFinishMock,
            onError: onErrorMock,
          },
        )

        expect(onFinishMock).toHaveBeenCalledWith(finalResponse)
        expect(response).toEqual(finalResponse)
        expect(onErrorMock).not.toHaveBeenCalled()
      }),
    )

    it(
      'sends mcpHeaders in request body when provided (non-streaming)',
      server.boundary(async () => {
        const { mockBody, conversationUuid } = mockRequest({
          server,
          apiVersion: 'v3',
          conversationUuid: 'fake-document-log-uuid',
          fakeResponse: RUN_TEXT_RESPONSE,
        })

        await sdk.prompts.chat(
          conversationUuid,
          [
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
          {
            stream: false,
            mcpHeaders: {
              'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            },
          },
        )

        expect(mockBody).toHaveBeenCalledWith({
          body: {
            __internal: { source: LogSources.API },
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
            tools: [],
            stream: false,
            mcpHeaders: {
              'stripe-mcp': { authorization: 'Bearer sk_test_123' },
            },
          },
        })
      }),
    )

    it('retries 3 times if gateway is not available', async () => {
      const onErrorMock = vi.fn()
      const { mockFn, conversationUuid } = mock502Response({
        server,
        apiVersion: 'v3',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
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
        { stream: false, onError: onErrorMock },
      )

      expect(mockFn).toHaveBeenCalledTimes(3)
      expect(onErrorMock).toHaveBeenCalledWith(
        new LatitudeApiError({
          status: 502,
          serverResponse: JSON.stringify({
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: ApiErrorCodes.InternalServerError,
          }),
          message: 'Something bad happened',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
    })

    it('does not throw error if onError option is present', async () => {
      const onErrorMock = vi.fn()
      const { mockFn, conversationUuid } = mock502Response({
        server,
        apiVersion: 'v3',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
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
        { stream: false, onError: onErrorMock },
      )

      expect(mockFn).toHaveBeenCalledTimes(3)
      expect(onErrorMock).toHaveBeenCalledWith(
        new LatitudeApiError({
          status: 502,
          serverResponse: JSON.stringify({
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: ApiErrorCodes.InternalServerError,
          }),
          message: 'Something bad happened',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
    })

    it('throws error if onError option is not present', async () => {
      const { mockFn, conversationUuid } = mock502Response({
        server,
        apiVersion: 'v3',
        conversationUuid: 'fake-document-log-uuid',
      })

      await expect(
        sdk.prompts.chat(
          conversationUuid,
          [
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
          { stream: false },
        ),
      ).rejects.toThrowError(
        new LatitudeApiError({
          status: 502,
          serverResponse: JSON.stringify({
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: ApiErrorCodes.InternalServerError,
          }),
          message: 'Something bad happened',
          errorCode: ApiErrorCodes.InternalServerError,
          dbErrorRef: undefined,
        }),
      )
      expect(mockFn).toHaveBeenCalledTimes(3)
    })
  })
})
