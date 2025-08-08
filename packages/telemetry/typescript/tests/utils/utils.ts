import * as otel from '@opentelemetry/api'
import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-node'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { expect, vi } from 'vitest'

export function mockRequest({
  server,
  method,
  endpoint,
  response,
  baseUrl,
}: {
  server: ReturnType<typeof setupServer>
  method: keyof typeof http
  endpoint: string
  response?: Record<string, unknown>
  baseUrl?: string
}) {
  if (!baseUrl) baseUrl = 'https://fake-host.com'
  if (!response) response = {}

  const headersMock = vi.fn()
  const methodMock = vi.fn()
  const endpointMock = vi.fn()
  const bodyMock = vi.fn()

  server.use(
    http[method](`${baseUrl}${endpoint}`, async ({ request }) => {
      headersMock(Object.fromEntries(request.headers.entries()))
      methodMock(request.method)
      endpointMock(request.url.slice(baseUrl.length))
      bodyMock(await request.json())
      return HttpResponse.json(response)
    }),
  )

  return { headersMock, methodMock, endpointMock, bodyMock }
}

export class MockSpanProcessor implements SpanProcessor {
  onStart = vi.fn((_span: ReadableSpan, _context: otel.Context): void => {
    // Noop
  })

  onEnd = vi.fn((_span: ReadableSpan): void => {
    // Noop
  })

  forceFlush = vi.fn((): Promise<void> => {
    return Promise.resolve()
  })

  shutdown = vi.fn((): Promise<void> => {
    return Promise.resolve()
  })

  mockClear() {
    this.onStart.mockClear()
    this.onEnd.mockClear()
    this.forceFlush.mockClear()
    this.shutdown.mockClear()
  }

  mockReset() {
    this.onStart.mockReset()
    this.onEnd.mockReset()
    this.forceFlush.mockReset()
    this.shutdown.mockReset()
  }

  mockRestore() {
    this.onStart.mockRestore()
    this.onEnd.mockRestore()
    this.forceFlush.mockRestore()
    this.shutdown.mockRestore()
  }
}

export function expectMasked(value: string) {
  let pattern = value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  pattern = pattern.replace(/%ANY%/g, '[^"]+')
  const regex = new RegExp(`^${pattern}$`)

  return expect.stringMatching(regex)
}
