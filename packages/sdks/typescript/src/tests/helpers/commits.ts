import { ApiErrorCodes } from '@latitude-data/constants/errors'
import type { SdkApiVersion } from '$sdk/utils/types'
import { http, HttpResponse } from 'msw'
import type { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>

export function mockPushCommitAuthHeader({
  server,
  apiVersion,
  projectId,
  commitUuid,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  commitUuid: string
}) {
  const mockFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${commitUuid}/push`,
      (info) => {
        mockFn(info.request.headers.get('Authorization'))
        return HttpResponse.json({ commitUuid: 'new-commit-uuid' })
      },
    ),
  )
  return { mockFn }
}

export function mockPushCommitBody({
  server,
  apiVersion,
  projectId,
  commitUuid,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  commitUuid: string
}) {
  const mockResponse = {
    commitUuid: 'new-commit-uuid-123',
    documentsProcessed: 3,
  }

  const mockBodyFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${commitUuid}/push`,
      async (info) => {
        const body = await info.request.json()
        mockBodyFn(body)
        return HttpResponse.json(mockResponse)
      },
    ),
  )

  return { mockResponse, mockBodyFn }
}

export function mockPushCommitError({
  server,
  apiVersion,
  projectId,
  commitUuid,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  commitUuid: string
}) {
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${commitUuid}/push`,
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
