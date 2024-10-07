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

describe('message', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it(
    'sends auth header',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/conversations/fake-document-log-uuid/chat',
          (info) => {
            mockFn(info.request.headers.get('Authorization'))
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.chat('fake-document-log-uuid', [])
      expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
    }),
  )

  it(
    'send data onMessage callback',
    server.boundary(async () => {
      const onMessageMock = vi.fn()
      server.use(
        http.post(
          'http://localhost:8787/api/v1/conversations/fake-document-log-uuid/chat',
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
      await SDK.chat('fake-document-log-uuid', [], {
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
      const final = await SDK.run('path/to/document', {
        projectId,
        parameters: { foo: 'bar', lol: 'foo' },
        onFinished: onFinishMock,
      })
      expect(onFinishMock).toHaveBeenCalledWith(FINAL_RESPONSE)
      expect(final).toEqual(FINAL_RESPONSE)
    }),
  )

  it(
    'calls endpoint with body and headers',
    server.boundary(async () => {
      const mockFn = vi.fn()
      let body = {}
      server.use(
        http.post(
          'http://localhost:8787/api/v1/conversations/fake-document-log-uuid/chat',
          async (info) => {
            const reader = info.request.body!.getReader()
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunks = new TextDecoder('utf-8').decode(value).trim()
              body = JSON.parse(chunks)
            }

            mockFn({ body })
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.chat('fake-document-log-uuid', [])

      expect(mockFn).toHaveBeenCalledWith({
        body: {
          __internal: { source: LogSources.API },
          messages: [],
        },
      })
    }),
  )

  it('uses the versionUUID from the constructor if no versionUUID is passed to the chat method', async () => {
    const mockFn = vi.fn()
    let body = {}
    server.use(
      http.post(
        'http://localhost:8787/api/v1/projects/123/versions/fake-version-uuid/documents/run',
        async (info) => {
          const reader = info.request.body!.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunks = new TextDecoder('utf-8').decode(value).trim()
            body = JSON.parse(chunks)
          }

          mockFn({ body })
          return HttpResponse.json({})
        },
      ),
    )
    const sdk = new Latitude(latitudeApiKey, {
      projectId,
      versionUuid: 'fake-version-uuid',
    })
    await sdk.run('fake-document-log-uuid')

    expect(mockFn).toHaveBeenCalledWith({
      body: {
        __internal: { source: LogSources.API },
        path: 'fake-document-log-uuid',
      },
    })
  })

  it('overrides constructor versionUUID with the versionUUID from the run call', async () => {
    const mockFn = vi.fn()
    let body = {}
    server.use(
      http.post(
        'http://localhost:8787/api/v1/projects/123/versions/fake-version-uuid-override/documents/run',
        async (info) => {
          const reader = info.request.body!.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunks = new TextDecoder('utf-8').decode(value).trim()
            body = JSON.parse(chunks)
          }

          mockFn({ body })
          return HttpResponse.json({})
        },
      ),
    )
    const sdk = new Latitude(latitudeApiKey, {
      projectId,
      versionUuid: 'fake-version-uuid',
    })
    await sdk.run('fake-document-log-uuid', {
      versionUuid: 'fake-version-uuid-override',
    })

    expect(mockFn).toHaveBeenCalledWith({
      body: {
        __internal: { source: LogSources.API },
        path: 'fake-document-log-uuid',
      },
    })
  })

  it('calls live version if no versionUUID is provided anyhwere', async () => {
    const mockFn = vi.fn()
    let body = {}
    server.use(
      http.post(
        'http://localhost:8787/api/v1/projects/123/versions/live/documents/run',
        async (info) => {
          const reader = info.request.body!.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunks = new TextDecoder('utf-8').decode(value).trim()
            body = JSON.parse(chunks)
          }

          mockFn({ body })
          return HttpResponse.json({})
        },
      ),
    )
    const sdk = new Latitude(latitudeApiKey, {
      projectId,
    })
    await sdk.run('fake-document-log-uuid')

    expect(mockFn).toHaveBeenCalledWith({
      body: {
        __internal: { source: LogSources.API },
        path: 'fake-document-log-uuid',
      },
    })
  })
})
