import { ApiErrorCodes } from '@latitude-data/constants/errors'
import { SdkApiVersion } from '$sdk/utils/types'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>

export function mockGetVersionAuthHeader({
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
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}`,
      (info) => {
        mockFn(info.request.headers.get('Authorization'))
        return HttpResponse.json({})
      },
    ),
  )
  return { mockFn }
}

export function mockGetVersionBody({
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
  const mockResponse = {
    id: 1,
    uuid: versionUuid,
    projectId,
    message: 'Test version',
    authorName: 'Test Author',
    authorEmail: 'test@example.com',
    authorId: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    status: 'active',
    parentCommitUuid: null,
  }
  server.use(
    http.get(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}`,
      () => {
        return HttpResponse.json(mockResponse)
      },
    ),
  )

  return { mockResponse }
}

export function mockCreateVersionAuthHeader({
  server,
  apiVersion,
  projectId,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
}) {
  const mockFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions`,
      (info) => {
        mockFn(info.request.headers.get('Authorization'))
        return HttpResponse.json({})
      },
    ),
  )
  return { mockFn }
}

export function mockCreateVersionBody({
  server,
  apiVersion,
  projectId,
  versionName,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  versionName: string
}) {
  const mockResponse = {
    id: 1,
    uuid: 'new-version-uuid-123',
    projectId,
    message: versionName,
    authorName: 'Test Author',
    authorEmail: 'test@example.com',
    authorId: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    status: 'active',
    parentCommitUuid: null,
  }

  const mockBodyFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions`,
      async (info) => {
        const body = await info.request.json()
        mockBodyFn(body)
        return HttpResponse.json(mockResponse)
      },
    ),
  )

  return { mockResponse, mockBodyFn }
}

export function mockVersionsError({
  server,
  apiVersion,
  projectId,
  versionUuid,
  method = 'GET',
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  versionUuid?: string
  method?: 'GET' | 'POST'
}) {
  const httpMethod = method === 'GET' ? http.get : http.post
  const url = versionUuid
    ? `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}`
    : `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions`

  server.use(
    httpMethod(url, () => {
      return HttpResponse.json(
        {
          message: 'Something went wrong',
          errorCode: ApiErrorCodes.InternalServerError,
        },
        { status: 500 },
      )
    }),
  )
}
