import { SdkApiVersion } from '$sdk/utils/types'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>

export function mockAuthHeader({
  server,
  apiVersion,
  docPath,
}: {
  server: Server
  apiVersion: SdkApiVersion
  docPath: string
}) {
  const mockFn = vi.fn()
  server.use(
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/live/documents/${docPath}`,
      (info) => {
        mockFn(info.request.headers.get('Authorization'))
        return HttpResponse.json({})
      },
    ),
  )
  return { docPath, mockFn }
}

export function mockGetBody({
  server,
  apiVersion,
  docPath,
  version,
}: {
  server: Server
  apiVersion: SdkApiVersion
  version: string
  docPath: string
}) {
  const mockResponse = { data: 'some data' }
  server.use(
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/${version}/documents/${docPath}`,
      () => {
        return HttpResponse.json(mockResponse)
      },
    ),
  )

  return { docPath, version, mockResponse }
}

export function mock500Error({
  server,
  apiVersion,
  docPath,
}: {
  server: Server
  apiVersion: SdkApiVersion
  docPath: string
}) {
  const mockError = { error: 'something went wrong' }
  server.use(
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/live/documents/${docPath}`,
      () => {
        // @ts-expect-error - mock error
        return HttpResponse.status(500).json(mockError)
      },
    ),
  )
  return { docPath }
}
