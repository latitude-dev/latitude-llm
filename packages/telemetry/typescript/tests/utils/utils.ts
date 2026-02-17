import * as otel from '@opentelemetry/api'
import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-node'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { expect, vi } from 'vitest'

type OtlpBody = {
  resourceSpans: Array<{
    resource: {
      attributes: Array<{ key: string; value: Record<string, unknown> }>
      droppedAttributesCount: number
    }
    scopeSpans: Array<{
      scope: { name: string; version: string }
      spans: Array<{
        traceId: string
        spanId: string
        parentSpanId?: string
        name: string
        kind: number
        startTimeUnixNano: string
        endTimeUnixNano: string
        attributes: Array<{ key: string; value: Record<string, unknown> }>
        droppedAttributesCount: number
        events: Array<{
          name: string
          timeUnixNano: string
          droppedAttributesCount: number
          attributes: Array<{ key: string; value: Record<string, unknown> }>
        }>
        droppedEventsCount: number
        status: { code: number; message?: string }
        links: unknown[]
        droppedLinksCount: number
      }>
    }>
  }>
}

export function normalizeBody(body: OtlpBody): OtlpBody {
  const clone: OtlpBody = JSON.parse(JSON.stringify(body))
  let counter = 0
  const idMap = new Map<string, string>()
  const ignoredAttributeKeys = new Set([
    'latitude.commit_uuid',
    'latitude.document_log_uuid',
    'latitude.document_uuid',
    'latitude.documentLogUuid',
    'latitude.documentUuid',
  ])

  function mapId(id: string): string {
    if (!idMap.has(id)) {
      idMap.set(id, `ID_${counter++}`)
    }
    return idMap.get(id)!
  }

  for (const rs of clone.resourceSpans) {
    for (const attr of rs.resource.attributes) {
      if (attr.key === 'telemetry.sdk.version') {
        attr.value = { stringValue: 'SDK_VERSION' } as any
      }
    }
    for (const ss of rs.scopeSpans) {
      for (const span of ss.spans) {
        span.traceId = mapId(span.traceId)
        span.spanId = mapId(span.spanId)
        if (span.parentSpanId) {
          span.parentSpanId = mapId(span.parentSpanId)
        }
        if (span.name.startsWith('prompt-')) {
          span.name = 'prompt'
        }
        span.startTimeUnixNano = 'TIME'
        span.endTimeUnixNano = 'TIME'
        for (const event of span.events || []) {
          if (event.timeUnixNano) event.timeUnixNano = 'TIME'
          for (const attr of event.attributes || []) {
            if (attr.key === 'exception.stacktrace') {
              attr.value = { stringValue: 'STACKTRACE' } as any
            }
          }
        }
        span.attributes = (span.attributes || [])
          .map((attr) => {
            if (attr.key === 'latitude.documentLogUuid') {
              return {
                ...attr,
                key: 'latitude.document_log_uuid',
                value: { stringValue: 'DOC_LOG_UUID' },
              }
            }

            if (attr.key === 'latitude.document_log_uuid') {
              return {
                ...attr,
                value: { stringValue: 'DOC_LOG_UUID' },
              }
            }

            if (attr.key === 'latitude.documentUuid') {
              return {
                ...attr,
                key: 'latitude.document_uuid',
              }
            }

            return attr
          })
          .filter((attr) => !ignoredAttributeKeys.has(attr.key))
      }
    }
  }
  return clone
}

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
