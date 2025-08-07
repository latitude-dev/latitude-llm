import { SdkApiVersion } from '$sdk/utils/types'
import { ApiErrorCodes } from '@latitude-data/constants/errors'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>

export function mockAuthHeader({
  server,
  apiVersion,
}: {
  server: Server
  apiVersion: SdkApiVersion
}) {
  const mockFn = vi.fn()
  server.use(
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/live/documents`,
      (info) => {
        mockFn(info.request.headers.get('Authorization'))
        return HttpResponse.json({})
      },
    ),
  )
  return { mockFn }
}

export function mockGetBody({
  server,
  apiVersion,
  version,
}: {
  server: Server
  apiVersion: SdkApiVersion
  version: string
}) {
  const mockResponse = { data: 'some data' }
  server.use(
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/${version}/documents`,
      () => {
        return HttpResponse.json(mockResponse)
      },
    ),
  )

  return { version, mockResponse }
}

export function mock500Error({
  server,
  apiVersion,
}: {
  server: Server
  apiVersion: SdkApiVersion
  docPath: string
}) {
  server.use(
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/live/documents`,
      () => {
        return HttpResponse.json(
          {
            message: 'Something went wrong',
            errorCode: ApiErrorCodes.InternalServerError,
          },
          { status: 500 },
        )
      },
    ),
  )
}
