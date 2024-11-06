import { CHUNKS, FINAL_RESPONSE } from '$sdk/test/chunks-example'
import { ApiErrorCodes } from '$sdk/utils/errors'
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
  docPath,
}: {
  server: Server
  apiVersion: SdkApiVersion
  docPath: string
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()
  let body = {}
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${docPath}/chat`,
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

        mockBody({ body })
        return HttpResponse.json({})
      },
    ),
  )
  return { mockAuthHeader, mockUrl, mockBody, docPath }
}

export function mockStreamResponse({
  server,
  apiVersion,
  docPath,
}: {
  server: Server
  docPath: string
  apiVersion: SdkApiVersion
}) {
  let stream: ReadableStream
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${docPath}/chat`,
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
  return { chunks: CHUNKS, finalResponse: FINAL_RESPONSE, docPath }
}

export function mockNonStreamResponse({
  server,
  apiVersion,
  docPath,
}: {
  server: Server
  docPath: string
  apiVersion: SdkApiVersion
}) {
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${docPath}/chat`,
      () => HttpResponse.json(FINAL_RESPONSE),
    ),
  )
  return { finalResponse: FINAL_RESPONSE, docPath }
}

export function mock502Response({
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
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${docPath}/chat`,
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
  return { mockFn, docPath }
}
