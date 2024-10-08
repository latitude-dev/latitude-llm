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

let latitudeApiKey = 'fake-api-key'
let projectId = 123
const SDK = new Latitude(latitudeApiKey)

const server = setupServer()

describe('get', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it(
    'sends auth header',
    server.boundary(async () => {
      const mockFn = vi.fn()
      server.use(
        http.get(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/fake-document-id',
          (info) => {
            mockFn(info.request.headers.get('Authorization'))
            return HttpResponse.json({})
          },
        ),
      )
      await SDK.get('fake-document-id', { projectId })
      expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
    }),
  )

  it(
    'handles response correctly',
    server.boundary(async () => {
      const mockResponse = { data: 'some data' }
      server.use(
        http.get(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/fake-document-id',
          () => {
            return HttpResponse.json(mockResponse)
          },
        ),
      )
      const response = await SDK.get('fake-document-id', { projectId })
      expect(response).toEqual(mockResponse)
    }),
  )

  it(
    'handles errors correctly',
    server.boundary(async () => {
      const mockError = { error: 'something went wrong' }
      server.use(
        http.get(
          'http://localhost:8787/api/v1/projects/123/versions/live/documents/fake-document-id',
          () => {
            // @ts-expect-error - mock error
            return HttpResponse.status(500).json(mockError)
          },
        ),
      )
      try {
        await SDK.get('fake-document-id', { projectId })
      } catch (error) {
        // @ts-expect-error - mock error
        expect(error.message).toEqual(
          'Unexpected API Error: 500 Unhandled Exception',
        )
      }
    }),
  )

  it('target correct version uuid if one is provided', async () => {
    const mockResponse = { data: 'some data' }
    server.use(
      http.get(
        'http://localhost:8787/api/v1/projects/123/versions/fake-version-uuid/documents/fake-document-id',
        () => {
          return HttpResponse.json(mockResponse)
        },
      ),
    )
    const response = await SDK.get('fake-document-id', {
      projectId,
      versionUuid: 'fake-version-uuid',
    })
    expect(response).toEqual(mockResponse)
  })
})
