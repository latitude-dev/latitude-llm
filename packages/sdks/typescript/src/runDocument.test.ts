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

import { LatitudeSdk } from './index'

const encoder = new TextEncoder()
let latitudeApiKey = 'fake-api-key'
let projectId = 123
const SDK = new LatitudeSdk({
  latitudeApiKey,
})

const server = setupServer()

describe('runDocument', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it(
    'sends auth header',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/commits/live/documents/run',
          (info) => {
            mockFn(info.request.headers.get('Authorization'))
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.runDocument({
        params: { projectId, documentPath: 'path/to/document' },
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
          'http://localhost:8787/api/v1/projects/123/commits/live/documents/run',
          (info) => {
            mockFn(info.request.url)
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.runDocument({
        params: { projectId, documentPath: 'path/to/document' },
      })
      expect(mockFn).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/projects/123/commits/live/documents/run',
      )
    }),
  )

  it(
    'sends request with specific commitUuid',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/commits/SOME_UUID/documents/run',
          (info) => {
            mockFn(info.request.url)
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.runDocument({
        params: {
          projectId,
          documentPath: 'path/to/document',
          commitUuid: 'SOME_UUID',
        },
      })
      expect(mockFn).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/projects/123/commits/SOME_UUID/documents/run',
      )
    }),
  )

  it(
    'sends documentPath and parameters',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/commits/SOME_UUID/documents/run',
          async (info) => {
            const body = await info.request.json()
            mockFn(body)
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.runDocument({
        params: {
          projectId,
          documentPath: 'path/to/document',
          commitUuid: 'SOME_UUID',
          parameters: { foo: 'bar', lol: 'foo' },
        },
      })
      expect(mockFn).toHaveBeenCalledWith({
        documentPath: 'path/to/document',
        parameters: { foo: 'bar', lol: 'foo' },
      })
    }),
  )

  it(
    'send data onMessage callback',
    server.boundary(async () => {
      const onMessageMock = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/commits/live/documents/run',
          async () => {
            const stream = new ReadableStream({
              start(controller) {
                CHUNKS.forEach((chunk, index) => {
                  controller.enqueue(encoder.encode(JSON.stringify(chunk)))
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
      await SDK.runDocument({
        params: {
          projectId,
          documentPath: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
        },
        onMessage: onMessageMock,
      })
      CHUNKS.forEach((chunk, index) => {
        expect(onMessageMock).toHaveBeenNthCalledWith(index + 1, chunk)
      })
    }),
  )

  it(
    'send on Error callback when chunk is not a valid JSON',
    server.boundary(async () => {
      const onMessageMock = vi.fn()
      const onErrorMock = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/commits/live/documents/run',
          async () => {
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode('invalid json'))
                controller.close()
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
      await SDK.runDocument({
        params: {
          projectId,
          documentPath: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
        },
        onMessage: onMessageMock,
        onError: onErrorMock,
      })
      expect(onErrorMock).toHaveBeenCalledWith(expect.any(Error))
    }),
  )

  it(
    'sends all message onFinish callback and final response',
    server.boundary(async () => {
      const onFinishMock = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/projects/123/commits/live/documents/run',
          async () => {
            const stream = new ReadableStream({
              start(controller) {
                CHUNKS.forEach((chunk, index) => {
                  controller.enqueue(encoder.encode(JSON.stringify(chunk)))
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
      const final = await SDK.runDocument({
        params: {
          projectId,
          documentPath: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
        },
        onFinished: onFinishMock,
      })
      expect(onFinishMock).toHaveBeenCalledWith(FINAL_RESPONSE)
      expect(final).toEqual(FINAL_RESPONSE)
    }),
  )
})
