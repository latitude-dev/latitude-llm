import { Latitude, LogSources } from '$sdk/index'
import { ApiErrorCodes, LatitudeApiError } from '$sdk/utils/errors'
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
  mock200Response,
  mock502Response,
  mockRequest,
} from './helpers/getOrCreate'

const FAKE_API_KEY = 'fake-api-key'
let sdk: Latitude

const server = setupServer()

describe('/get-or-create', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    vi.clearAllMocks()
    sdk = new Latitude(FAKE_API_KEY)
  })

  it(
    'makes request with version uuid set',
    server.boundary(async () => {
      const { mockAuthHeader, mockUrl, mockBody, projectId, versionUuid } =
        mockRequest({
          server,
          apiVersion: 'v3',
          projectId: 31,
          versionUuid: 'fake-version-uuid',
        })

      await sdk.prompts.getOrCreate('fake-document-path', {
        projectId,
        versionUuid,
        prompt: 'fake-prompt',
      })

      expect(mockAuthHeader).toHaveBeenCalledWith(`Bearer ${FAKE_API_KEY}`)
      expect(mockUrl).toHaveBeenCalledWith(
        `http://localhost:8787/api/v3/projects/${projectId}/versions/${versionUuid}/documents/get-or-create`,
      )
      expect(mockBody).toHaveBeenCalledWith({
        path: 'fake-document-path',
        prompt: 'fake-prompt',
        __internal: { source: LogSources.API },
      })
    }),
  )

  it(
    'makes request without version uuid set',
    server.boundary(async () => {
      const { mockAuthHeader, mockUrl, mockBody, projectId } = mockRequest({
        server,
        apiVersion: 'v3',
        projectId: 31,
      })

      await sdk.prompts.getOrCreate('fake-document-path', {
        projectId,
      })

      expect(mockAuthHeader).toHaveBeenCalledWith(`Bearer ${FAKE_API_KEY}`)
      expect(mockUrl).toHaveBeenCalledWith(
        `http://localhost:8787/api/v3/projects/${projectId}/versions/live/documents/get-or-create`,
      )
      expect(mockBody).toHaveBeenCalledWith({
        path: 'fake-document-path',
        __internal: { source: LogSources.API },
      })
    }),
  )

  it(
    'returns response',
    server.boundary(async () => {
      const {
        mockFn,
        response: expected,
        projectId,
        versionUuid,
      } = mock200Response({
        server,
        apiVersion: 'v3',
        projectId: 31,
        versionUuid: 'fake-version-uuid',
      })

      const response = await sdk.prompts.getOrCreate('fake-document-path', {
        projectId,
        versionUuid,
        prompt: 'fake-prompt',
      })

      expect(response).toEqual(expected)
      expect(mockFn).toHaveBeenCalledTimes(1)
    }),
  )

  it(
    'fails and retries 3 times if gateway is not available',
    server.boundary(async () => {
      const { mockFn, projectId, versionUuid } = mock502Response({
        server,
        apiVersion: 'v3',
        projectId: 31,
        versionUuid: 'fake-version-uuid',
      })

      await expect(
        sdk.prompts.getOrCreate('fake-document-path', {
          projectId,
          versionUuid,
          prompt: 'fake-prompt',
        }),
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
    }),
  )
})
