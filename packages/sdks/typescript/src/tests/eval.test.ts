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

describe('/eval', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  const sdk = new Latitude(latitudeApiKey)

  it('sends auth header', async () => {
    const { mockAuthHeader } = mockEvalRequest({
      server,
      apiVersion: 'v2',
    })

    await sdk.eval(conversationUuid)
    expect(mockAuthHeader).toHaveBeenCalledWith(`Bearer ${latitudeApiKey}`)
  })

  it('sends evaluation uuids in body when provided', async () => {
    const { mockBody } = mockEvalRequest({
      server,
      apiVersion: 'v2',
    })

    const evaluationUuids = [randomUUID(), randomUUID()]
    await sdk.eval(conversationUuid, { evaluationUuids })

    expect(mockBody).toHaveBeenCalledWith({
      evaluationUuids,
      __internal: { source: LogSources.API },
    })
  })

  it('sends empty evaluationUuids when not provided', async () => {
    const { mockBody } = mockEvalRequest({
      server,
      apiVersion: 'v2',
    })

    await sdk.eval(conversationUuid)

    expect(mockBody).toHaveBeenCalledWith({
      evaluationUuids: undefined,
      __internal: { source: LogSources.API },
    })
  })

  it('returns evaluation uuid on success', async () => {
    const expectedResponse = { uuid: randomUUID() }
    mockEvalRequest({
      server,
      apiVersion: 'v2',
      response: expectedResponse,
    })

    const result = await sdk.eval(conversationUuid)
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
      apiVersion: 'v2',
      response: errorResponse,
      status: 400,
    })

    await expect(sdk.eval(conversationUuid)).rejects.toThrow(
      new LatitudeApiError({
        status: 400,
        serverResponse: JSON.stringify(errorResponse),
        message: errorResponse.message,
        errorCode: errorResponse.errorCode,
      }),
    )
  })
})
