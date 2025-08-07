import { SdkApiVersion } from '$sdk/utils/types'
import { ApiErrorCodes } from '@latitude-data/constants/errors'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>

export function mockCreatePromptAuthHeader({
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
  const mockFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}/documents`,
      (info) => {
        mockFn(info.request.headers.get('Authorization'))
        return HttpResponse.json({})
      },
    ),
  )
  return { mockFn }
}

export function mockCreatePromptBody({
  server,
  apiVersion,
  projectId,
  versionUuid = 'live',
  promptPath,
}: {
  server: Server
  apiVersion: SdkApiVersion
  projectId: number
  versionUuid?: string
  promptPath: string
}) {
  const mockResponse = {
    id: 1,
    uuid: 'prompt-uuid-123',
    path: promptPath,
    content: 'Test prompt content',
    config: {},
    provider: 'openai',
    model: 'gpt-4',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }

  const mockBodyFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}/documents`,
      async (info) => {
        const body = await info.request.json()
        mockBodyFn(body)
        return HttpResponse.json(mockResponse)
      },
    ),
  )

  return { mockResponse, mockBodyFn }
}

export function mockCreatePromptError({
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
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${versionUuid}/documents`,
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
