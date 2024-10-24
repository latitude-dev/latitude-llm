import { LogSources } from '@latitude-data/core/browser'
import { Latitude } from '$sdk/index'
import { FINAL_RESPONSE } from '$sdk/test/chunks-example'
import {
  LatitudeMissingStreamOption,
  LatitudeWrongSdkVersion,
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

import { mockRequest, mockStreamResponse } from './helpers/run'

let latitudeApiKey = 'fake-api-key'
let projectId = 123

const server = setupServer()

describe('Wrong sdk version', () => {
  it('throws error', async () => {
    expect(
      () =>
        // @ts-ignore
        new Latitude(latitudeApiKey, { apiVersion: 'patata' }),
    ).toThrowError(new LatitudeWrongSdkVersion('patata'))
  })
})

describe('/run', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  describe('v1', () => {
    let sdk = new Latitude(latitudeApiKey)

    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockAuthHeader } = mockRequest({
          server,
          apiVersion: 'v1',
          version: 'live',
          projectId: '123',
        })
        await sdk.run('path/to/document', {
          projectId,
        })

        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'sends project id',
      server.boundary(async () => {
        const { mockUrl } = mockRequest({
          server,
          apiVersion: 'v1',
          version: 'live',
          projectId: '123',
        })
        await sdk.run('path/to/document', {
          projectId,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/run',
        )
      }),
    )

    it('it use project id defined in class', async () => {
      sdk = new Latitude(latitudeApiKey, {
        projectId: 345,
        apiVersion: 'v1',
      })
      const { mockUrl } = mockRequest({
        server,
        apiVersion: 'v1',
        version: 'live',
        projectId: '345',
      })
      await sdk.run('path/to/document')
      expect(mockUrl).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/projects/345/versions/live/documents/run',
      )
    })

    it(
      'sends request with specific versionUuid',
      server.boundary(async () => {
        const { mockUrl, version } = mockRequest({
          server,
          apiVersion: 'v1',
          version: 'SOME_UUID',
          projectId: '123',
        })
        await sdk.run('path/to/document', {
          projectId,
          versionUuid: version,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v1/projects/123/versions/SOME_UUID/documents/run',
        )
      }),
    )

    it(
      'sends documentPath and parameters and customIdentifier',
      server.boundary(async () => {
        const { mockBody } = mockRequest({
          server,
          apiVersion: 'v1',
          version: 'SOME_UUID',
          projectId: '123',
        })
        await sdk.run('path/to/document', {
          projectId,
          versionUuid: 'SOME_UUID',
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
        })
        expect(mockBody).toHaveBeenCalledWith({
          path: 'path/to/document',
          parameters: { foo: 'bar', lol: 'foo' },
          customIdentifier: 'miau',
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
          apiVersion: 'v1',
        })
        await sdk.run('path/to/document', {
          projectId,
          parameters: { foo: 'bar', lol: 'foo' },
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
          apiVersion: 'v1',
        })
        const final = await sdk.run('path/to/document', {
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

  describe('v2', () => {
    let sdk = new Latitude<'v2'>(latitudeApiKey, { apiVersion: 'v2' })

    it('throws error', async () => {
      expect(
        async () =>
          // @ts-expect-error - missing stream option
          await sdk.run('path/to/document', {
            projectId,
            versionUuid: 'SOME_UUID',
            parameters: { foo: 'bar', lol: 'foo' },
            customIdentifier: 'miau',
          }),
      ).rejects.toThrowError(new LatitudeMissingStreamOption())
    })

    describe('with streaming', () => {
      it(
        'sends auth header',
        server.boundary(async () => {
          const { mockAuthHeader } = mockRequest({
            server,
            apiVersion: 'v2',
            version: 'live',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
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
            apiVersion: 'v2',
            version: 'live',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
            projectId,
            stream: true,
          })
          expect(mockUrl).toHaveBeenCalledWith(
            'http://localhost:8787/api/v2/projects/123/versions/live/documents/run',
          )
        }),
      )

      it('it use project id defined in class', async () => {
        sdk = new Latitude(latitudeApiKey, {
          projectId: 345,
          apiVersion: 'v2',
        })
        const { mockUrl } = mockRequest({
          server,
          apiVersion: 'v2',
          version: 'live',
          projectId: '345',
        })
        await sdk.run('path/to/document', {
          stream: true,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v2/projects/345/versions/live/documents/run',
        )
      })

      it(
        'sends request with specific versionUuid',
        server.boundary(async () => {
          const { mockUrl, version } = mockRequest({
            server,
            apiVersion: 'v2',
            version: 'SOME_UUID',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
            projectId,
            versionUuid: version,
            stream: true,
          })
          expect(mockUrl).toHaveBeenCalledWith(
            'http://localhost:8787/api/v2/projects/123/versions/SOME_UUID/documents/run',
          )
        }),
      )

      it(
        'sends documentPath and parameters and customIdentifier',
        server.boundary(async () => {
          const { mockBody } = mockRequest({
            server,
            apiVersion: 'v2',
            version: 'SOME_UUID',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
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
            apiVersion: 'v2',
          })
          await sdk.run('path/to/document', {
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
            apiVersion: 'v2',
          })
          const final = await sdk.run('path/to/document', {
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
    })

    describe('no-streaming', () => {
      it(
        'sends auth header',
        server.boundary(async () => {
          const { mockAuthHeader } = mockRequest({
            server,
            apiVersion: 'v2',
            version: 'live',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
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
            apiVersion: 'v2',
            version: 'live',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
            projectId,
            stream: false,
          })
          expect(mockUrl).toHaveBeenCalledWith(
            'http://localhost:8787/api/v2/projects/123/versions/live/documents/run',
          )
        }),
      )

      it('it use project id defined in class', async () => {
        sdk = new Latitude(latitudeApiKey, {
          projectId: 345,
          apiVersion: 'v2',
        })
        const { mockUrl } = mockRequest({
          server,
          apiVersion: 'v2',
          version: 'live',
          projectId: '345',
        })
        await sdk.run('path/to/document', {
          stream: false,
        })
        expect(mockUrl).toHaveBeenCalledWith(
          'http://localhost:8787/api/v2/projects/345/versions/live/documents/run',
        )
      })

      it(
        'sends request with specific versionUuid',
        server.boundary(async () => {
          const { mockUrl, version } = mockRequest({
            server,
            apiVersion: 'v2',
            version: 'SOME_UUID',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
            projectId,
            versionUuid: version,
            stream: false,
          })
          expect(mockUrl).toHaveBeenCalledWith(
            'http://localhost:8787/api/v2/projects/123/versions/SOME_UUID/documents/run',
          )
        }),
      )

      it(
        'send body stream, customIdentifier, path, parameters',
        server.boundary(async () => {
          const { mockBody } = mockRequest({
            server,
            apiVersion: 'v2',
            version: 'SOME_UUID',
            projectId: '123',
          })
          await sdk.run('path/to/document', {
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
          mockStreamResponse({
            server,
            apiVersion: 'v2',
          })
          await sdk.run('path/to/document', {
            projectId,
            parameters: { foo: 'bar', lol: 'foo' },
            stream: false,
            onEvent: onMessageMock,
          })
          expect(onMessageMock).not.toHaveBeenCalled()
        }),
      )

      /* it( */
      /*   'sends all message onFinish callback and final response', */
      /*   server.boundary(async () => { */
      /*     const onFinishMock = vi.fn() */
      /*     const onErrorMock = vi.fn() */
      /*     mockStreamResponse({ */
      /*       server, */
      /*       apiVersion: 'v2', */
      /*     }) */
      /*     const response = await sdk.run('path/to/document', { */
      /*       projectId, */
      /*       parameters: { foo: 'bar', lol: 'foo' }, */
      /*       stream: false, */
      /*       onFinished: onFinishMock, */
      /*       onError: onErrorMock, */
      /*     }) */
      /*     expect(onErrorMock).not.toHaveBeenCalled() */
      /*     expect(onFinishMock).toHaveBeenCalledWith(FINAL_RESPONSE) */
      /*     expect(final).toEqual(FINAL_RESPONSE) */
      /*   }), */
      /* ) */
    })
  })
})
