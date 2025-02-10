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
const conversationUuid = randomUUID()

const server = setupServer()

function mockEvalRequest({
  server,
  apiVersion,
  response = {},
  status = 200,
}: {
  server: ReturnType<typeof setupServer>
  apiVersion: string
  response?: object
  status?: number
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()

  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${conversationUuid}/evaluate`,
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

function mockEvalResultRequest({
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
      `http://localhost:8787/api/${apiVersion}/conversations/${conversationUuid}/evaluations/${evaluationUuid}/evaluation-results`,
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

describe('evaluations.trigger', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  const sdk = new Latitude(latitudeApiKey)

  it('sends auth header', async () => {
    const { mockAuthHeader } = mockEvalRequest({
      server,
      apiVersion: 'v3',
    })

    await sdk.evaluations.trigger(conversationUuid)
    expect(mockAuthHeader).toHaveBeenCalledWith(`Bearer ${latitudeApiKey}`)
  })

  it('sends evaluation uuids in body when provided', async () => {
    const { mockBody } = mockEvalRequest({
      server,
      apiVersion: 'v3',
    })

    const evaluationUuids = [randomUUID(), randomUUID()]
    await sdk.evaluations.trigger(conversationUuid, { evaluationUuids })

    expect(mockBody).toHaveBeenCalledWith({
      evaluationUuids,
      __internal: { source: LogSources.API },
    })
  })

  it('sends empty evaluationUuids when not provided', async () => {
    const { mockBody } = mockEvalRequest({
      server,
      apiVersion: 'v3',
    })

    await sdk.evaluations.trigger(conversationUuid)

    expect(mockBody).toHaveBeenCalledWith({
      evaluationUuids: undefined,
      __internal: { source: LogSources.API },
    })
  })

  it('returns evaluation uuid on success', async () => {
    const expectedResponse = { uuid: randomUUID() }
    mockEvalRequest({
      server,
      apiVersion: 'v3',
      response: expectedResponse,
    })

    const result = await sdk.evaluations.trigger(conversationUuid)
    expect(result).toEqual(expectedResponse)
  })

  it('throws LatitudeApiError on error response', async () => {
    const errorResponse = {
      name: 'LatitudeError',
      message: 'Invalid conversation UUID',
      errorCode: ApiErrorCodes.HTTPException,
    }

    mockEvalRequest({
      server,
      apiVersion: 'v3',
      response: errorResponse,
      status: 400,
    })

    await expect(sdk.evaluations.trigger(conversationUuid)).rejects.toThrow(
      new LatitudeApiError({
        status: 400,
        serverResponse: JSON.stringify(errorResponse),
        message: errorResponse.message,
        errorCode: errorResponse.errorCode,
      }),
    )
  })

  describe('evaluations.result', () => {
    it('should successfully submit an evaluation result', async () => {
      const mockResponse = { uuid: 'eval-result-uuid' }
      const { mockBody, mockAuthHeader } = mockEvalResultRequest({
        server,
        apiVersion: 'v3',
        response: mockResponse,
        conversationUuid: 'conversation-uuid',
        evaluationUuid: 'eval-uuid',
      })

      const result = await sdk.evaluations.createResult(
        'conversation-uuid',
        'eval-uuid',
        {
          result: true,
          reason: 'Test reason',
        },
      )

      expect(result).toEqual(mockResponse)
      expect(mockAuthHeader).toHaveBeenCalledWith(`Bearer ${latitudeApiKey}`)
      expect(mockBody).toHaveBeenCalledWith({
        result: true,
        reason: 'Test reason',
        __internal: { source: LogSources.API },
      })
    })

    it('should throw an error when the API request fails', async () => {
      const errorResponse = {
        message: 'Invalid evaluation result',
        errorCode: ApiErrorCodes.HTTPException,
      }

      mockEvalResultRequest({
        server,
        apiVersion: 'v3',
        response: errorResponse,
        status: 400,
        conversationUuid: 'conversation-uuid',
        evaluationUuid: 'eval-uuid',
      })

      await expect(
        sdk.evaluations.createResult('conversation-uuid', 'eval-uuid', {
          result: true,
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
