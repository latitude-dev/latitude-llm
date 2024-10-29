import { LogSources } from '@latitude-data/core/browser'
import { Latitude } from '$sdk/index'
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
  mockAuthHeader,
  mockBodyResponse,
  mockChatMessage,
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

  it(
    'sends auth header',
    server.boundary(async () => {
      const mockFn = mockAuthHeader({ server, apiVersion: 'v2' })
      await sdk.chat('fake-document-log-uuid', [])
      expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
    }),
  )

  it(
    'send data onMessage callback',
    server.boundary(async () => {
      const onMessageMock = vi.fn()
      const { chunks, docPath } = mockChatMessage({
        server,
        docPath: 'fake-document-log-uuid',
        apiVersion: 'v2',
      })

      await sdk.chat(docPath, [], { onEvent: onMessageMock })

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
    'calls endpoint with body and headers',
    server.boundary(async () => {
      const { mockBody, docPath } = mockBodyResponse({
        server,
        apiVersion: 'v2',
        docPath: 'fake-document-log-uuid',
      })
      await sdk.chat(docPath, [])

      expect(mockBody).toHaveBeenCalledWith({
        body: {
          __internal: { source: LogSources.API },
          messages: [],
        },
      })
    }),
  )

  it('should retry 3 times if gateway is not available', async () => {
    const { mockFn, docPath } = mock502Response({
      server,
      apiVersion: 'v2',
      docPath: 'fake-document-log-uuid',
    })

    await sdk.chat(docPath, [])
    expect(mockFn).toHaveBeenCalledTimes(3)
  })
})
