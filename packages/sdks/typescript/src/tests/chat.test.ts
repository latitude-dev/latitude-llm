import { ContentType, MessageRole } from '@latitude-data/compiler'
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
          mockRequest({
            server,
            apiVersion: 'v2',
            conversationUuid: 'fake-document-log-uuid',
          })

        await sdk.prompts.chat(
          conversationUuid,
          [
            {
              role: MessageRole.user,
              content: [
                {
                  type: ContentType.text,
                  text: 'fake-user-content',
                },
              ],
            },
          ],
          { stream: true },
        )

        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
        expect(mockUrl).toHaveBeenCalledWith(
          `http://localhost:8787/api/v2/conversations/${conversationUuid}/chat`,
        )
        expect(mockBody).toHaveBeenCalledWith({
          body: {
            __internal: { source: LogSources.API },
            messages: [
              {
                role: MessageRole.user,
                content: [
                  {
                    type: ContentType.text,
                    text: 'fake-user-content',
                  },
                ],
              },
            ],
            stream: true,
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
          apiVersion: 'v2',
        })

        const response = await sdk.prompts.chat(
          conversationUuid,
          [
            {
              role: MessageRole.user,
              content: [
                {
                  type: ContentType.text,
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
        apiVersion: 'v2',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
            errorCode: 'LatitudeError',
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
        apiVersion: 'v2',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
            errorCode: 'LatitudeError',
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
        apiVersion: 'v2',
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
                  type: ContentType.text,
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
            errorCode: 'LatitudeError',
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
            apiVersion: 'v2',
            conversationUuid: 'fake-document-log-uuid',
          })

        await sdk.prompts.chat(
          conversationUuid,
          [
            {
              role: MessageRole.user,
              content: [
                {
                  type: ContentType.text,
                  text: 'fake-user-content',
                },
              ],
            },
          ],
          { stream: false },
        )

        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
        expect(mockUrl).toHaveBeenCalledWith(
          `http://localhost:8787/api/v2/conversations/${conversationUuid}/chat`,
        )
        expect(mockBody).toHaveBeenCalledWith({
          body: {
            __internal: { source: LogSources.API },
            messages: [
              {
                role: MessageRole.user,
                content: [
                  {
                    type: ContentType.text,
                    text: 'fake-user-content',
                  },
                ],
              },
            ],
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
          apiVersion: 'v2',
        })

        const response = await sdk.prompts.chat(
          conversationUuid,
          [
            {
              role: MessageRole.user,
              content: [
                {
                  type: ContentType.text,
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

    it('retries 3 times if gateway is not available', async () => {
      const onErrorMock = vi.fn()
      const { mockFn, conversationUuid } = mock502Response({
        server,
        apiVersion: 'v2',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
            errorCode: 'LatitudeError',
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
        apiVersion: 'v2',
        conversationUuid: 'fake-document-log-uuid',
      })

      await sdk.prompts.chat(
        conversationUuid,
        [
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
            errorCode: 'LatitudeError',
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
        apiVersion: 'v2',
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
                  type: ContentType.text,
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
            errorCode: 'LatitudeError',
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
