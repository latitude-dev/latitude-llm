import { ApiErrorCodes } from '@latitude-data/constants/errors'
import { CHUNKS } from '$sdk/test/chunks-example'
import { parseSSE } from '$sdk/utils/parseSSE'
import { SdkApiVersion } from '$sdk/utils/types'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>
const encoder = new TextEncoder()

export function mockRequest({
  server,
  apiVersion,
  version,
  projectId,
}: {
  server: Server
  version: string
  projectId: string
  apiVersion: SdkApiVersion
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/${projectId}/versions/${version}/documents/run`,
      async (info) => {
        mockAuthHeader(info.request.headers.get('Authorization'))
        mockUrl(info.request.url)
        const body = await info.request.json()
        mockBody(body)
        return HttpResponse.json({})
      },
    ),
  )
  return { mockAuthHeader, mockUrl, mockBody, version }
}

export function mockStreamResponse({
  server,
  apiVersion,
}: {
  server: Server
  apiVersion: SdkApiVersion
}) {
  let stream: ReadableStream
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/projects/123/versions/live/documents/run`,
      async () => {
        stream = new ReadableStream({
          start(controller) {
            CHUNKS.forEach((chunk, index) => {
              // @ts-expect-error
              const { event, data } = parseSSE(chunk)
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
              )
              if (index === CHUNKS.length - 1) {
                controller.close()
              }
            })
          },
        })

        return new HttpResponse(stream, {
          headers: {
            'Content-Type': 'text/plain',
          },
        })
      },
    ),
  )
  return { chunks: CHUNKS }
}

export function mockNonStreamResponse({
  server,
  expectedBody,
  expectedStatus = 200,
}: {
  server: Server
  expectedBody: object | string
  expectedStatus?: number
}) {
  server.use(
    http.post(
      'http://localhost:8787/api/v2/projects/123/versions/live/documents/run',
      () =>
        typeof expectedBody === 'object'
          ? HttpResponse.json(expectedBody, { status: expectedStatus })
          : HttpResponse.text(expectedBody, { status: expectedStatus }),
    ),
  )
}

export function mock502Response({ server }: { server: Server }) {
  const mockFn = vi.fn()
  server.use(
    http.post(
      'http://localhost:8787/api/v2/projects/123/versions/live/documents/run',
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
  return { mockFn }
}
