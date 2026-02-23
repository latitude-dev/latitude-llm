import { ApiErrorCodes } from '@latitude-data/constants/errors'
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
    http.delete(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/live/documents/${docPath}`,
      (info) => {
        mockFn(info.request.headers.get('Authorization'))
        return HttpResponse.json({
          documentUuid: 'fake-uuid',
          path: docPath,
        })
      },
    ),
  )
  return { docPath, mockFn }
}

export function mockDeleteBody({
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
  const mockResponse = {
    documentUuid: 'fake-uuid',
    path: docPath,
  }
  server.use(
    http.delete(
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
  server.use(
    http.delete(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/live/documents/${docPath}`,
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
  return { docPath }
}
