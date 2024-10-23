import { LogSources } from '@latitude-data/core/browser'
import { CHUNKS } from '$sdk/test/chunks-example'
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
import { LatitudeMissingStreamOption } from '$sdk/utils/errors'

const encoder = new TextEncoder()
let latitudeApiKey = 'fake-api-key'
let projectId = 123
const SDK = new Latitude(latitudeApiKey, { apiVersion: 'v2' })

const server = setupServer()

describe('run', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  describe('it fails if stream is not specified', () => {
    it('throws error', async () => {
      expect(
        async () =>
          await SDK.run('path/to/document', {
            projectId,
            versionUuid: 'SOME_UUID',
            parameters: { foo: 'bar', lol: 'foo' },
            customIdentifier: 'miau',
          }),
      ).rejects.toThrowError(new LatitudeMissingStreamOption())
    })
  })

  describe('without streaming', () => {
    it(
      'sends documentPath and parameters and customIdentifier',
      server.boundary(async () => {
        const mockFn = vi.fn()
        server.use(
          http.post(
            'http://localhost:8787/api/v2/projects/123/versions/SOME_UUID/documents/run',
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
          stream: true,
          customIdentifier: 'miau',
        })
        expect(mockFn).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
          stream: true,
          __internal: { source: LogSources.API },
        })
      }),
    )

    it(
      'sends documentPath and parameters and customIdentifier',
      server.boundary(async () => {
        const mockFn = vi.fn()
        server.use(
          http.post(
            'http://localhost:8787/api/v2/projects/123/versions/SOME_UUID/documents/run',
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
          stream: true,
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
        })
        expect(mockFn).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
          stream: true,
          customIdentifier: 'miau',
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
            'http://localhost:8787/api/v2/projects/123/versions/live/documents/run',
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
          stream: false,
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
  })

  /* it( */
  /*   'sends all message onFinish callback and final response', */
  /*   server.boundary(async () => { */
  /*     const onFinishMock = vi.fn() */
  /*     server.use( */
  /*       http.post( */
  /*         'http://localhost:8787/api/v1/projects/123/versions/live/documents/run', */
  /*         async () => { */
  /*           const stream = new ReadableStream({ */
  /*             start(controller) { */
  /*               CHUNKS.forEach((chunk, index) => { */
  /*                 // @ts-expect-error */
  /*                 const { event, data } = parseSSE(chunk) */
  /*                 controller.enqueue( */
  /*                   encoder.encode(`event: ${event}\ndata: ${data}\n\n`), */
  /*                 ) */
  /*                 if (index === CHUNKS.length - 1) { */
  /*                   controller.close() */
  /*                 } */
  /*               }) */
  /*             }, */
  /*           }) */
  /**/
  /*           return new HttpResponse(stream, { */
  /*             headers: { */
  /*               'Content-Type': 'text/plain', */
  /*             }, */
  /*           }) */
  /*         }, */
  /*       ), */
  /*     ) */
  /*     const onErrorMock = vi.fn() */
  /*     const final = await SDK.run('path/to/document', { */
  /*       projectId, */
  /*       parameters: { foo: 'bar', lol: 'foo' }, */
  /*       onFinished: onFinishMock, */
  /*       onError: onErrorMock, */
  /*     }) */
  /*     expect(onErrorMock).not.toHaveBeenCalled() */
  /*     expect(onFinishMock).toHaveBeenCalledWith(FINAL_RESPONSE) */
  /*     expect(final).toEqual(FINAL_RESPONSE) */
  /*   }), */
  /* ) */
})
