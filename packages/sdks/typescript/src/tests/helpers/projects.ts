import { ApiErrorCodes } from '@latitude-data/constants/errors'
import type { SdkApiVersion } from '$sdk/utils/types'
import { http, HttpResponse } from 'msw'
import type { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>

export function mockGetAllProjectsRequest({
  server,
  apiVersion,
}: {
  server: Server
  apiVersion: SdkApiVersion
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  server.use(
    http.get(`http://localhost:8787/api/${apiVersion}/projects`, (info) => {
      mockAuthHeader(info.request.headers.get('Authorization'))
      mockUrl(info.request.url)
      return HttpResponse.json([])
    }),
  )
  return { mockAuthHeader, mockUrl }
}

export function mockGetAllProjectsResponse({
  server,
  apiVersion,
}: {
  server: Server
  apiVersion: SdkApiVersion
}) {
  const mockResponse = [
    {
      id: 1,
      name: 'Test Project 1',
      workspaceId: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
    },
    {
      id: 2,
      name: 'Test Project 2',
      workspaceId: 1,
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      deletedAt: null,
    },
  ]
  const mockFn = vi.fn()
  server.use(
    http.get(`http://localhost:8787/api/${apiVersion}/projects`, () => {
      mockFn('called!')
      return HttpResponse.json(mockResponse)
    }),
  )

  return { mockResponse, mockFn }
}

export function mockCreateProjectRequest({
  server,
  apiVersion,
}: {
  server: Server
  apiVersion: SdkApiVersion
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()
  let body = {}
  server.use(
    http.post(`http://localhost:8787/api/${apiVersion}/projects`, async (info) => {
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
      return HttpResponse.json({
        project: { id: 1, name: 'New Project' },
        version: { id: 1, uuid: 'version-uuid' },
      })
    }),
  )
  return { mockAuthHeader, mockUrl, mockBody }
}

export function mockCreateProjectResponse({
  server,
  apiVersion,
  projectName,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectName: string
}) {
  const mockResponse = {
    project: {
      id: 1,
      name: projectName,
      workspaceId: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
    },
    version: {
      id: 1,
      uuid: 'version-uuid-123',
      projectId: 1,
      message: 'Initial version',
      authorName: null,
      authorEmail: null,
      authorId: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'active',
      parentCommitUuid: null,
    },
  }

  const mockFn = vi.fn()
  server.use(
    http.post(`http://localhost:8787/api/${apiVersion}/projects`, () => {
      mockFn('called!')
      return HttpResponse.json(mockResponse)
    }),
  )

  return { mockResponse, mockFn }
}

export function mockProjectsError({
  server,
  apiVersion,
  method = 'GET',
}: {
  server: Server
  apiVersion: SdkApiVersion
  method?: 'GET' | 'POST'
}) {
  const httpMethod = method === 'GET' ? http.get : http.post
  server.use(
    httpMethod(`http://localhost:8787/api/${apiVersion}/projects`, () => {
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
