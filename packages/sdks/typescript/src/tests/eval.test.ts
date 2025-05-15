import { randomUUID } from 'crypto'

import { Latitude, LogSources } from '$sdk/index'
import { ApiErrorCodes, LatitudeApiError } from '$sdk/utils/errors'
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

const latitudeApiKey = randomUUID()

const server = setupServer()

function mockAnnotateRequest({
  server,
  apiVersion,
  evaluationUuid,
  conversationUuid,
  response = {},
  status = 200,
}: {
  server: ReturnType<typeof setupServer>
  apiVersion: string
  evaluationUuid: string
  conversationUuid: string
  response?: object
  status?: number
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()

  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${conversationUuid}/evaluations/${evaluationUuid}/annotate`,
      async (info) => {
        mockAuthHeader(info.request.headers.get('Authorization'))
        mockUrl(info.request.url)
        const body = await info.request.json()
        mockBody(body)
        return HttpResponse.json(response, { status })
      },
    ),
  )

  return { mockAuthHeader, mockUrl, mockBody }
}

describe('evaluations', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  const sdk = new Latitude(latitudeApiKey)

  describe('annotate', () => {
    it('should successfully submit an evaluation result', async () => {
      const mockResponse = { uuid: 'eval-result-uuid' }
      const { mockBody, mockAuthHeader } = mockAnnotateRequest({
        server,
        apiVersion: 'v3',
        response: mockResponse,
        conversationUuid: 'conversation-uuid',
        evaluationUuid: 'eval-uuid',
      })

      const result = await sdk.evaluations.annotate(
        'conversation-uuid',
        5,
        'eval-uuid',
        {
          reason: 'Test reason',
        },
      )

      expect(result).toEqual(mockResponse)
      expect(mockAuthHeader).toHaveBeenCalledWith(`Bearer ${latitudeApiKey}`)
      expect(mockBody).toHaveBeenCalledWith({
        score: 5,
        metadata: {
          reason: 'Test reason',
        },
        __internal: { source: LogSources.API },
      })
    })

    it('should send the versionUuid when provided', async () => {
      const mockResponse = { uuid: 'eval-result-uuid' }
      const { mockBody, mockAuthHeader } = mockAnnotateRequest({
        server,
        apiVersion: 'v3',
        response: mockResponse,
        conversationUuid: 'conversation-uuid',
        evaluationUuid: 'eval-uuid',
      })

      const result = await sdk.evaluations.annotate(
        'conversation-uuid',
        5,
        'eval-uuid',
        {
          reason: 'Test reason',
          versionUuid: 'eval-version-uuid',
        },
      )

      expect(result).toEqual(mockResponse)
      expect(mockAuthHeader).toHaveBeenCalledWith(`Bearer ${latitudeApiKey}`)
      expect(mockBody).toHaveBeenCalledWith({
        score: 5,
        versionUuid: 'eval-version-uuid',
        metadata: {
          reason: 'Test reason',
        },
        __internal: { source: LogSources.API },
      })
    })

    it('should throw an error when the API request fails', async () => {
      const errorResponse = {
        message: 'Invalid evaluation result',
        errorCode: ApiErrorCodes.HTTPException,
      }

      mockAnnotateRequest({
        server,
        apiVersion: 'v3',
        response: errorResponse,
        status: 400,
        conversationUuid: 'conversation-uuid',
        evaluationUuid: 'eval-uuid',
      })

      await expect(
        sdk.evaluations.annotate('conversation-uuid', 5, 'eval-uuid', {
          reason: 'Test reason',
        }),
      ).rejects.toThrow(
        new LatitudeApiError({
          status: 400,
          serverResponse: JSON.stringify(errorResponse),
          message: errorResponse.message,
          errorCode: errorResponse.errorCode,
        }),
      )
    })
  })
})
