import { ApiErrorCodes } from '@latitude-data/constants/errors'
import { RESPONSE } from '$sdk/test/document-example'
import { SdkApiVersion } from '$sdk/utils/types'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>

export function mockRequest({
  server,
  apiVersion,
  projectId,
  versionUuid = 'live',
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  versionUuid?: string
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()
  let body = {}
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}/documents/get-or-create`,
      async (info) => {
        mockAuthHeader(info.request.headers.get('Authorization'))
        mockUrl(info.request.url)

        const reader = info.request.body!.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunks = new TextDecoder('utf-8').decode(value).trim()
          body = JSON.parse(chunks)
        }

        mockBody(body)
        return HttpResponse.json({})
      },
    ),
  )
  return { mockAuthHeader, mockUrl, mockBody, projectId, versionUuid }
}

export function mock200Response({
  server,
  apiVersion,
  projectId,
  versionUuid,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  versionUuid: string
}) {
  const mockFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}/documents/get-or-create`,
      () => {
        mockFn('called!')
        return HttpResponse.json(RESPONSE)
      },
    ),
  )
  return { mockFn, response: RESPONSE, projectId, versionUuid }
}

export function mock502Response({
  server,
  apiVersion,
  projectId,
  versionUuid,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  versionUuid: string
}) {
  const mockFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}/documents/get-or-create`,
      () => {
        mockFn('called!')
        return HttpResponse.json(
          {
            name: 'LatitudeError',
            message: 'Something bad happened',
            errorCode: ApiErrorCodes.InternalServerError,
          },
          { status: 502 },
        )
      },
    ),
  )
  return { mockFn, projectId, versionUuid }
}
