import { LogSources } from '@latitude-data/core/browser'
import { CHUNKS, FINAL_RESPONSE } from '$sdk/test/chunks-example'
import { http, HttpResponse } from 'msw'
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

import { Latitude } from './index'
import { parseSSE } from './utils/parseSSE'

const encoder = new TextEncoder()
let latitudeApiKey = 'fake-api-key'
let projectId = 123
const SDK = new Latitude(latitudeApiKey)

const server = setupServer()

describe('run', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it(
    'sends auth header',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/run',
          (info) => {
            mockFn(info.request.headers.get('Authorization'))
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.run('path/to/document', {
        projectId,
      })
      expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
    }),
  )

  it(
    'sends project id',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/run',
          (info) => {
            mockFn(info.request.url)
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.run('path/to/document', {
        projectId,
      })
      expect(mockFn).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/projects/123/versions/live/documents/run',
      )
    }),
  )

  it(
    'sends request with specific versionUuid',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/versions/SOME_UUID/documents/run',
          (info) => {
            mockFn(info.request.url)
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.run('path/to/document', {
        projectId,
        versionUuid: 'SOME_UUID',
      })
      expect(mockFn).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/projects/123/versions/SOME_UUID/documents/run',
      )
    }),
  )

  it(
    'sends documentPath and parameters',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/versions/SOME_UUID/documents/run',
          async (info) => {
            const body = await info.request.json()
            mockFn(body)
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.run('path/to/document', {
        projectId,
        versionUuid: 'SOME_UUID',
        parameters: { foo: 'bar', lol: 'foo' },
      })
      expect(mockFn).toHaveBeenCalledWith({
        path: 'path/to/document',
        parameters: { foo: 'bar', lol: 'foo' },
        __internal: { source: LogSources.API },
      })
    }),
  )

  it(
    'send data onMessage callback',
    server.boundary(async () => {
      const onMessageMock = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/run',
          async () => {
            const stream = new ReadableStream({
              start(controller) {
                CHUNKS.forEach((chunk, index) => {
                  // @ts-expect-error
                  const { event, data } = parseSSE(chunk)
                  controller.enqueue(
                    encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
                  )
                  if (index === CHUNKS.length - 1) {
                    controller.close()
                  }
                })
              },
            })

            return new HttpResponse(stream, {
              headers: {
                'Content-Type': 'text/plain',
              },
            })
          },
        ),
      )
      await SDK.run('path/to/document', {
        projectId,
        parameters: { foo: 'bar', lol: 'foo' },
        onEvent: onMessageMock,
      })
      CHUNKS.forEach((chunk, index) => {
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
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/run',
          async () => {
            const stream = new ReadableStream({
              start(controller) {
                CHUNKS.forEach((chunk, index) => {
                  // @ts-expect-error
                  const { event, data } = parseSSE(chunk)
                  controller.enqueue(
                    encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
                  )
                  if (index === CHUNKS.length - 1) {
                    controller.close()
                  }
                })
              },
            })

            return new HttpResponse(stream, {
              headers: {
                'Content-Type': 'text/plain',
              },
            })
          },
        ),
      )
      const onErrorMock = vi.fn()
      const final = await SDK.run('path/to/document', {
        projectId,
        parameters: { foo: 'bar', lol: 'foo' },
        onFinished: onFinishMock,
        onError: onErrorMock,
      })
      expect(onErrorMock).not.toHaveBeenCalled()
      expect(onFinishMock).toHaveBeenCalledWith(FINAL_RESPONSE)
      expect(final).toEqual(FINAL_RESPONSE)
    }),
  )
})
