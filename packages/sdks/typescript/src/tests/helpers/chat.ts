import { CHUNKS, FINAL_RESPONSE } from '$sdk/test/chunks-example'
import { ApiErrorCodes } from '$sdk/utils/errors'
import { parseSSE } from '$sdk/utils/parseSSE'
import { ChatSyncAPIResponse, SdkApiVersion } from '$sdk/utils/types'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

type Server = ReturnType<typeof setupServer>
const encoder = new TextEncoder()

export function mockRequest({
  server,
  apiVersion,
  conversationUuid,
  fakeResponse,
}: {
  server: Server
  apiVersion: SdkApiVersion
  conversationUuid: string
  fakeResponse?: ChatSyncAPIResponse
}) {
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()
  let body = {}
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${conversationUuid}/chat`,
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
        return HttpResponse.json(fakeResponse ?? {})
      },
    ),
  )
  return { mockAuthHeader, mockUrl, mockBody, conversationUuid }
}

export function mockStreamResponse({
  server,
  apiVersion,
  conversationUuid,
}: {
  server: Server
  conversationUuid: string
  apiVersion: SdkApiVersion
}) {
  let stream: ReadableStream
  const mockAuthHeader = vi.fn()
  const mockUrl = vi.fn()
  const mockBody = vi.fn()
  let body = {}
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${conversationUuid}/chat`,
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
        stream = new ReadableStream({
          start(controller) {
            CHUNKS.forEach((chunk, index) => {
              // @ts-expect-error - TextEncoder is available in the environment
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
        mockBody({ body })
        return new HttpResponse(stream, {
          headers: {
            'Content-Type': 'text/plain',
          },
        })
      },
    ),
  )
  return {
    mockAuthHeader,
    mockUrl,
    mockBody,
    chunks: CHUNKS,
    finalResponse: FINAL_RESPONSE,
    conversationUuid,
  }
}

export function mockNonStreamResponse({
  server,
  apiVersion,
  conversationUuid,
}: {
  server: Server
  conversationUuid: string
  apiVersion: SdkApiVersion
}) {
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${conversationUuid}/chat`,
      () => HttpResponse.json(FINAL_RESPONSE),
    ),
  )
  return { finalResponse: FINAL_RESPONSE, conversationUuid }
}

export function mock502Response({
  server,
  apiVersion,
  conversationUuid,
}: {
  server: Server
  apiVersion: SdkApiVersion
  conversationUuid: string
}) {
  const mockFn = vi.fn()
  server.use(
    http.post(
      `http://localhost:8787/api/${apiVersion}/conversations/${conversationUuid}/chat`,
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
  return { mockFn, conversationUuid }
}
